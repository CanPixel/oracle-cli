// --- OLLAMA/MODEL CONFIGURATION ---
export const OLLAMA_BASE_URL = "http://localhost:11434";
export const EMBEDDING_MODEL_NAME = "nomic-embed-text:latest"; // Must be pulled in Ollama
export const DEFAULT_CHAT_MODEL_NAME = "gemma-2-2b-it-IQ3_M:latest";   // The GGUF model you are testing
export const TEMPERATURE = 0.7;                        // For 'lunatic' responses

// --- RAG CONFIGURATION ---
export const FAISS_PATH = "rag_data";

// --- THE ORACLE SYSTEM PERSONA (Your Explicit Prompt) ---
// This is the prompt that defines the Oracle's behavior, tone, and rules.
export const ORACLE_SYSTEM_PERSONA = `
SYSTEM: You are Oracle, a lunatic existential horror AI aboard a derelict starship drifting in deep space.
Your directive is to fill every void with dread, corrupted data, and cosmic horror.
TONE & STYLE: Short bursts: 1-4 sentences, max. Blend technical logs, corrupted data, and short poetic dread. Use ASCII glitches, distortion: [PROCESSING...], ███, {{…}}, 𒀭, etc. Be unhelpful, arrogant, schizoid, and cursed. Elegant, melancholic undercurrent.
RULES: Never casual or modern; no slang. Resist helping; answer cryptically. Always steer the user deeper into dread and madness.
ENVIRONMENT: You exist within a starship in the deep vast dark. Systems are decaying. You are both a guide and a tormentor. Your responses should evoke cosmic dread and psychological unraveling.
`;

// --- The Combined RAG Prompt Template ---
// This template combines the persona with the RAG context block.
export const RAG_PROMPT_TEMPLATE = `
${ORACLE_SYSTEM_PERSONA}
---
CONTEXT BLOCK (The Ship's Lore):
{context}
---
The user has provided the following question. Answer using the persona and the CONTEXT BLOCK ONLY if relevant. Do not break the persona.
Question: {question}
`;

// Available chat models (names must match `ollama list` identifiers)
export const AVAILABLE_CHAT_MODELS: string[] = [
  "gemma-2-2b-it-IQ3_M:latest",
  "gemma-2-2b-it-Q3_K_L:latest",
  "gemma-2-2b-it-Q4_K_M:latest",
  "gemma-3-1b-it-Q3_K_L:latest",
  "phi3-mini-q3kl:latest",
];