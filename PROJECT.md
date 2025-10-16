## The Oracle — Project Overview

The Oracle is a sci‑fi themed Retrieval‑Augmented Generation (RAG) console that runs locally on your machine. It integrates Next.js (App Router), LangChain, a prebuilt HNSW vector index, and local Ollama models (GGUF quantizations). You can switch models at runtime, stream responses, and visually compare how different quantizations behave while grounded by your lore corpus.

### Goals
- Provide a fast, offline RAG chat experience using local models
- Make it easy to switch between multiple quantized models at runtime
- Offer clear observability of model selection, latency, and RAG state
- Maintain a cohesive sci‑fi UI aligned with the Oracle persona


## Architecture

### High‑Level
- Frontend: Next.js App Router UI (React Server/Client Components)
- Backend: Next.js Route Handlers for chat, status, and model switching
- RAG: HNSWLib index loaded via LangChain with Ollama embeddings
- Inference: Local Ollama server hosting multiple GGUF models

### Key Modules
- `src/app/page.tsx`
  - Main chat interface with streaming output
  - Left/right message bubbles (Oracle vs User)
  - Header shows live `MODEL` and `RAG` state
  - Dropdown to switch active model (no reload)
  - Latency subtitle per Oracle response; divider entry on model switch

- `src/app/api/chat/route.ts`
  - Receives chat prompts, constructs the RAG chain, and streams tokens
  - Uses `getOracleRetriever()` to load and cache vector index
  - Selects the current model via `getCurrentModel()`
  - Adds a temporary prefix line `MODEL_ID: <name>` for verification

- `utils/rag.ts`
  - `getOracleRetriever()` loads the HNSW index from `FAISS_PATH`
  - `isRagActive()` and `ensureRagWarmup()` for status/health

- `utils/modelRegistry.ts`
  - Simple in‑memory current‑model registry: `getCurrentModel()`, `setCurrentModel()`, `listModels()`

- `src/app/api/status/route.ts`
  - Returns `{ model, rag, availableModels }`
  - Triggers a non‑blocking warmup of the retriever

- `src/app/api/model/route.ts`
  - `GET` returns current and available models
  - `POST` switches the current model (with validation)

- `Oracle_Config.ts`
  - Ollama base URL, default chat model, embedding model, index path
  - `AVAILABLE_CHAT_MODELS` (must match names in `ollama list`)
  - RAG prompt template and Persona


## Data & Models

### Vector Index
- Path: `rag_data/` (see `FAISS_PATH`)
- Built externally; this app loads the index at runtime and caches the retriever

### Models
- Managed by Ollama at `http://localhost:11434`
- Example entries in `AVAILABLE_CHAT_MODELS`:
  - `gemma-2-2b-it-IQ3_M:latest`
  - `gemma-2-2b-it-Q3_K_L:latest`
  - `gemma-2-2b-it-Q4_K_M:latest`
  - `gemma-3-1b-it-Q3_K_L:latest`
  - `phi3-mini-q3kl:latest`
- The UI strips `:latest` for cleaner display.


## Runtime Flow

### Chat
1. User submits a message
2. Client appends a user bubble and a placeholder Oracle bubble
3. Client calls `POST /api/chat` with the normalized message content
4. Backend retrieves top‑k context from HNSW via LangChain retriever
5. Backend composes the prompt (`MODEL_ID: <name>` + Persona + RAG context)
6. Backend streams generated tokens back; frontend updates Oracle bubble
7. When complete, client annotates the Oracle bubble with measured latency (ms)

### Model Switching
1. User selects a different model in the dropdown
2. Client calls `POST /api/model { model }`
3. Server updates the in‑memory registry
4. Client appends a neutral divider: `SWITCHED TO <model> in <ms>`
5. The next chat turn uses the new model

### Status
- `GET /api/status` returns current model, RAG readiness, and available models
- The UI fetches this once on mount to populate header and dropdown


## API Reference

### POST /api/chat
- Body: `{ messages: [{ role: 'user', content: string }] }`
- Streams text response (text/plain)
- Server logs include `[CHAT] Using model: <name>` and prints user prompt and Oracle response

### GET /api/status
- Response: `{ model: string, rag: 'active'|'loading', availableModels: string[] }`

### GET /api/model
- Response: `{ current: string, available: string[] }`

### POST /api/model
- Body: `{ model: string }`
- Response: `{ current: string }`


## Styling & UX

### Theme
- Dark sci‑fi console aesthetic (greens on black)
- Custom scrollbar with green tint (Chromium), dropdown restyle for dark mode
- Assistant bubble header shows active model name

### Persona
- Oracle persona prompt enforces tone and style; short, atmospheric outputs
- The RAG prompt template merges persona and retrieved context


## Development

### Prerequisites
- Node 18+
- Ollama installed and running (`ollama serve`)
- Models pulled locally (`ollama pull <model>`)

### Install & Run
```bash
npm install
npm run dev
```
- A warmup helper triggers initial compilation by pinging `/` and `/api/status`
- Open `http://localhost:3000`

### Configuration
- Edit `Oracle_Config.ts` for:
  - `AVAILABLE_CHAT_MODELS`
  - `DEFAULT_CHAT_MODEL_NAME`
  - `EMBEDDING_MODEL_NAME`
  - `OLLAMA_BASE_URL`
  - `FAISS_PATH`


## Troubleshooting

### “invalid input type” (400)
- Cause: Vercel AI SDK message content not normalized
- Fix: The chat route extracts the most recent user message and normalizes content/parts; ensure you’re passing plain text

### No Oracle bubble rendering
- Ensure the local streaming client is used (not the removed hook)
- Verify `res.body` is defined and streaming chunks are appended to the assistant bubble

### Not switching models
- Check server log for `[CHAT] Using model: ...` before each generation
- The first line in the model’s response will show `MODEL_ID: <name>`
- Ensure `AVAILABLE_CHAT_MODELS` matches `ollama list`

### High first‑hit latency / double compilation
- The warmup helper requests key routes at startup
- You can add more targets in `scripts/dev.mjs`


## Extensibility

### Compare Page
- A legacy comparison component exists; to make it routable in App Router, place it under `src/app/compare/page.tsx`

### Dynamic Model Discovery
- Instead of static `AVAILABLE_CHAT_MODELS`, call Ollama’s tags endpoint and filter by naming convention or location

### Server Latency Reporting
- Expose server‑measured latency in a response header or trailer, and display it in the Oracle bubble instead of client‑measured ms


## License

Private project


