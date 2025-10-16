import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { OllamaEmbeddings } from "@langchain/ollama";
import { BaseRetriever } from "@langchain/core/retrievers";

// --- Configuration ---
// Path to your local FAISS index directory (must contain index.bin and docstore.json)
import { 
    OLLAMA_BASE_URL, 
    EMBEDDING_MODEL_NAME, 
    FAISS_PATH
} from '@/Oracle_Config'; 

// A variable to cache the retriever so we only load the 725kb index once!
let cachedRetriever: BaseRetriever | null = null; 

/**
 * Loads the existing FAISS index (or uses the cached version) 
 * and returns a LangChain Retriever for RAG.
 */
export async function getOracleRetriever(): Promise<BaseRetriever> {
  if (cachedRetriever) {
    return cachedRetriever;
  }
  
  try {
    // 1. Initialize the Embedding Model (must match the one used for index creation)
    const embeddings = new OllamaEmbeddings({
      model: EMBEDDING_MODEL_NAME,
      baseUrl: OLLAMA_BASE_URL,
    });

    // 2. Load the pre-calculated FAISS index from the local directory
    const loadedVectorStore = await HNSWLib.load(
      FAISS_PATH, 
      embeddings
    );

    // 3. Cache the retriever and return it (set k=3 for top 3 results)
    cachedRetriever = loadedVectorStore.asRetriever({ k: 3 });
    return cachedRetriever;

  } catch (error) {
    console.error("ERROR: Could not load FAISS RAG Index. Is Ollama running?", error);
    throw new Error("RAG System Offline.");
  }
}

/**
 * Lightweight readiness indicator for RAG.
 * Returns true once the retriever has been successfully loaded and cached.
 */
export function isRagActive(): boolean {
  return cachedRetriever !== null;
}

/**
 * Best-effort background kick to warm up the retriever if not yet active.
 * Does not throw; intended for status endpoints or health probes.
 */
export async function ensureRagWarmup(): Promise<void> {
  if (cachedRetriever) return;
  try {
    await getOracleRetriever();
  } catch {
    // swallow; status can remain "loading" until next attempt
  }
}