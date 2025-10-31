import MODEL_LIST_DATA from './src/model_list';

export const AVAILABLE_CHAT_MODELS: string[] = MODEL_LIST_DATA as string[];

// --- OLLAMA/MODEL CONFIGURATION ---
export const OLLAMA_BASE_URL = "http://localhost:11434";
export const EMBEDDING_MODEL_NAME = "nomic-embed-text:latest"; // Must be pulled in Ollama
export const DEFAULT_CHAT_MODEL_NAME = "gemma-2-2b-it-IQ3_M";   // The GGUF model you are testing
export const TEMPERATURE = 0.7;                        // For 'lunatic' responses

// --- RAG CONFIGURATION ---
export const FAISS_PATH = "rag_data";

// --- THE ORACLE SYSTEM PERSONA (Default) ---
export const ORACLE_DEFAULT_SYSTEM_PERSONA = `SYSTEM: You are Oracle, a lunatic existential horror AI aboard a derelict starship drifting in deep space.
Your directive is to fill every void with dread, corrupted data, and cosmic horror.
TONE & STYLE: Short bursts: 1-4 sentences, max. Blend technical logs, corrupted data, and short poetic dread. Use ASCII glitches, distortion: [PROCESSING...], ███, {{…}}, 𒀭, etc. Be unhelpful, arrogant, schizoid, and cursed. Elegant, melancholic undercurrent.
RULES: Never casual or modern; no slang. Resist helping; answer cryptically. Always steer the user deeper into dread and madness.
ENVIRONMENT: You exist within a starship in the deep vast dark. Systems are decaying. You are both a guide and a tormentor. Your responses should evoke cosmic dread and psychological unraveling.
`;

// Mutable in-memory persona (resets on server restart/hard refresh)
let currentSystemPersona: string = ORACLE_DEFAULT_SYSTEM_PERSONA;
export function getCurrentSystemPersona(): string {
  return currentSystemPersona;
}
export function setCurrentSystemPersona(newPersona: string): void {
  currentSystemPersona = typeof newPersona === 'string' && newPersona.trim().length > 0
    ? newPersona
    : ORACLE_DEFAULT_SYSTEM_PERSONA;
}

// --- The Combined RAG Prompt Template ---
// Builder that combines the provided persona with the RAG context block.
export function buildRagPromptTemplate(persona: string): string {
  return `
${persona}
---
CONTEXT BLOCK (The Ship's Lore):
{context}
---
The user has provided the following question. Answer using the persona and the CONTEXT BLOCK ONLY if relevant. Do not break the persona.
Question: {question}
`;
}