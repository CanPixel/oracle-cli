// create_hnsw_index.ts

import { OllamaEmbeddings } from "@langchain/ollama";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { Document } from "@langchain/core/documents";
import * as fs from "fs/promises";
import * as path from "path";

// Import your configuration variables
// This assumes Oracle_Config.ts is in the src/ folder, adjust the path if necessary
import { 
    OLLAMA_BASE_URL, 
    EMBEDDING_MODEL_NAME, 
    FAISS_PATH // This is "rag_data"
} from './Oracle_Config'; 

// --- CONFIGURATION ---
const DATASET_FILE = FAISS_PATH + '/oracle_dataset_for_RAG.json'; 
const RAG_DATA_DIR = path.join(process.cwd(), FAISS_PATH);

async function createHNSWIndex() {
    console.log("--- Starting HNSWLib Index Creation ---");
    
    // 1. Delete old index files to ensure a clean save
    const filesToDelete = ["args.json", "hnswlib.dat"];

    for (const file of filesToDelete) {
        const filePath = path.join(RAG_DATA_DIR, file);
        try {
            await fs.unlink(filePath);
            console.log(`🗑️ Removed old index file: ${file}`);
        } catch (e) {
            // Ignore if the file doesn't exist
        }
    }

    // 2. Load data from the JSON file
    const jsonPath = path.join(process.cwd(), DATASET_FILE);
    
    // Ensure the data file exists before attempting to read it
    try {
        await fs.access(jsonPath);
    } catch (e) {
        throw new Error(`Data file not found at: ${jsonPath}. Please verify the path.`);
    }
    
    const rawData = await fs.readFile(jsonPath, 'utf-8');
    const qaData: Array<{ query_index: string, retrieved_lore: string }> = JSON.parse(rawData);

    // 3. Map JSON data to LangChain Document format
    const documents: Document[] = qaData.map(item => new Document({
        pageContent: item.retrieved_lore,
        metadata: {
            query_index: item.query_index
        }
    }));
    
    console.log(`Loaded ${documents.length} documents. Creating embeddings...`);

    // 4. Initialize Embeddings (Must match your app's config)
    const embeddings = new OllamaEmbeddings({
        model: EMBEDDING_MODEL_NAME, // "nomic-embed-text"
        baseUrl: OLLAMA_BASE_URL // "http://localhost:11434"
    });
    
    // **IMPORTANT**: Ollama must be running and the model must be pulled for this step to work.

    // 5. Create the HNSWLib vector store from the documents
    const vectorStore = await HNSWLib.fromDocuments(documents, embeddings);
    
    // 6. Save the HNSWLib index to the designated directory
    await fs.mkdir(RAG_DATA_DIR, { recursive: true });
    await vectorStore.save(RAG_DATA_DIR);
    
    console.log(`✅ HNSWLib Index successfully saved to: ${RAG_DATA_DIR}`);
    console.log("You can now run 'npm run dev' on your main application.");
}

createHNSWIndex().catch(error => {
    console.error("Critical Indexing Error:", error);
    if (error.message.includes("Could not import")) {
        console.error("\nHint: Did you run 'npm install hnswlib-node @langchain/community @langchain/ollama'?");
    }
    if (error.message.includes("404") || error.message.includes("Connection refused")) {
        console.error("\nHint: Is Ollama running and is the model ('nomic-embed-text') pulled?");
    }
});