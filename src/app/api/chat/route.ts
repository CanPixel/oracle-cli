import { Ollama } from "@langchain/ollama";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Import your configuration and the RAG logic
import { 
  OLLAMA_BASE_URL, 
  TEMPERATURE,
  RAG_PROMPT_TEMPLATE, // The combined prompt
} from '@/Oracle_Config'; 
import { getCurrentModel } from '@/utils/modelRegistry';
import { getOracleRetriever } from '@/utils/rag'; 

// IMPORTANT: This API Route must be configured to run in Node.js, 
// not the default Edge runtime, due to the heavy LangChain/FAISS dependencies.
export const runtime = 'nodejs'; 

// ----------------------------------------------------------------------
// 🛠️ HELPER: Converts LangChain's AsyncIterable to a standard Web Stream
// ----------------------------------------------------------------------
function iteratorToWebStream(asyncIterable: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = asyncIterable[Symbol.asyncIterator]();
  let accumulatedOutput = "";

  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();

      if (done) {
        if (accumulatedOutput.length > 0) {
          console.log("Oracle Response:", accumulatedOutput);
        }
        controller.close();
        return;
      }

      if (typeof value === 'string' && value.length > 0) {
        accumulatedOutput += value;
        controller.enqueue(encoder.encode(value));
      }
    },
    cancel() {
      // Best-effort log on cancellation
      if (accumulatedOutput.length > 0) {
        console.log("Oracle Response (partial):", accumulatedOutput);
      }
    }
  });
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Find the most recent USER message (the last item may be an assistant placeholder)
    const lastUserMessage = [...messages].reverse().find((m: any) => m && m.role === 'user');

    // Content can be a string or an array of parts; normalize to a plain string.
    const content = lastUserMessage?.content;
    const parts = (lastUserMessage as any)?.parts;
    
    // Prefer content if present; otherwise pull text from parts[] used by @ai-sdk/react
    let userQuestion = '';
    if (typeof content === 'string') {
      userQuestion = content;
    } else if (Array.isArray(content)) {
      userQuestion = content
        .filter((p: any) => p && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('\n');
    } else if (content && typeof content === 'object' && typeof (content as any).text === 'string') {
      userQuestion = (content as any).text;
    } else if (Array.isArray(parts)) {
      userQuestion = parts
        .filter((p: any) => p && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('\n');
    }

    console.log(`User Prompt: ${userQuestion}`);
    
    if (!userQuestion || userQuestion.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Empty user question received' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // 1. Initialize Retriever (loads the FAISS index once and uses the cache)
    const retriever = await getOracleRetriever();

    // 2. Initialize the LLM (Your selected model via Ollama)
    const modelName = getCurrentModel();
    console.log("[CHAT] Using model:", modelName);
    const ollamaModel = new Ollama({
      baseUrl: OLLAMA_BASE_URL,
      model: modelName,
      temperature: TEMPERATURE, 
      // streaming: true,
    });

    // 3. Define the RAG Chain using LangChain's Runnable API
    const augmentedTemplate = `MODEL_ID: ${modelName}\n` + RAG_PROMPT_TEMPLATE;
    const ragChain = RunnableSequence.from([
      // A. Retrieve: Takes the user's question, finds the top 3 relevant lore documents, 
      // and passes the formatted context string forward.
      {
        context: (input: { question: string }) => retriever.invoke(input.question).then(docs => 
          docs.map(doc => doc.pageContent).join("\n---\n")
        ),
        // Pass the original question through
        question: (input: { question: string }) => input.question, 
      },
      // B. Augment: Inserts the context and the question into the RAG_PROMPT_TEMPLATE
      PromptTemplate.fromTemplate(augmentedTemplate),
      
      // C. Generate: Sends the fully augmented prompt to Ollama
      ollamaModel,
      
      // D. Parse: Converts the output into a simple string stream
      new StringOutputParser(),
    ]);

    // 4. Invoke the chain and stream the response
    const stream = await ragChain.stream({ question: userQuestion });

    // 5. Convert the LangChain stream into a standard Web ReadableStream
    const webStream = iteratorToWebStream(stream);

    return new Response(webStream, {
      status: 200,
      headers: {
        // This header is crucial for the frontend to receive streaming tokens
        'Content-Type': 'text/plain; charset=utf-8', 
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Critical RAG Error:", error);
    // Provide a clear error message back to the client
    return new Response(
      JSON.stringify({ 
        error: "RAG System Offline. Check console logs for details (Is Ollama running? Is the model pulled?).",
        details: (error instanceof Error) ? error.message : "Unknown error",
      }), 
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}