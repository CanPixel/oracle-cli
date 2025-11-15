### The Oracle

Sci‑fi RAG console powered by local Ollama models. Switch between multiple GGUF quantizations, retrieve context from a prebuilt HNSW index, and chat with a cursed starship Oracle.

### Features
- Switch models at runtime via dropdown (no page reload)
- RAG over local HNSW index (cached retriever)
- Streaming responses with live Oracle bubble
- Per‑reply latency display; model switch divider entries
- Status endpoint indicating model name and RAG state

### Requirements
- Node 18+
- Ollama running locally at `http://localhost:11434`
- Pulled models (examples not in this repo):
  - `gemma-2-2b-it-Q4_K_M`
  - `gemma-3-1b-it-Q3_K_L`
  - `phi3-mini-q3kl`

### Install
```bash
npm install
```

### Dev
```bash
npm run dev
# A warmup helper will hit / and /api/status automatically
```
Open `http://localhost:3000`.

### Model Switching
- The header dropdown lists available models (from `Oracle_Config.ts: AVAILABLE_CHAT_MODELS`).
- Selecting a model updates the server‑side registry and subsequent chats use it.
- A divider appears in chat: `SWITCHED TO <model> in <ms>`.

### RAG Index
- Index path: `rag_data/` (see `FAISS_PATH`)
- Retriever is warmed on first access and cached

### API Overview
- `GET /api/status` → `{ model, rag, availableModels }`
- `POST /api/model { model }` → switch active model
- `POST /api/chat` → streams Oracle response

### Configuration
Edit `Oracle_Config.ts` for:
- `AVAILABLE_CHAT_MODELS`
- `DEFAULT_CHAT_MODEL_NAME`
- `EMBEDDING_MODEL_NAME`
- `OLLAMA_BASE_URL`

### Notes
- Scrollbars and dropdown styled for dark sci‑fi theme
