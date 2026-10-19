# The Oracle

Sci‑fi Retrieval‑Augmented Generation (RAG) console powered by local Ollama models. Switch between multiple GGUF quantizations at runtime, retrieve lore context from a local HNSW vector index, customize the live system persona, and chat with a cursed starship AI.

## Features

- **Runtime Model Switching:** Switch between local GGUF quantizations via the header dropdown without reloading the page; logs `SWITCHED TO <model> in <ms>` dividers in the chat stream.
- **Local HNSWLib RAG:** Retrieves lore context from `rag_data/` using `nomic-embed-text:latest` embeddings and caches the retriever across requests.
- **Live Persona Editor:** Inspect and modify the Oracle's system prompt at runtime via the wrench menu (`SystemPromptEditor`).
- **Corruption & Glitch Controls:** Interactive corruption slider (`CorruptionSlider`) and sci‑fi terminal aesthetics with live streaming readouts and per‑reply latency telemetry.
- **Auto‑Discovered Model List:** Automatically scans `rag_data/*.gguf` before `dev` and `build` to populate `src/model_list.js`.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) & React 19
- **Styling:** Tailwind CSS v4 & Lucide Icons
- **AI / RAG:** LangChain (`@langchain/ollama`, `@langchain/community`), Vercel AI SDK (`ai`, `@ai-sdk/react`), `hnswlib-node`
- **Inference:** Local [Ollama](https://ollama.com/) server (`http://localhost:11434`)

## Requirements

1. **Node.js** 20+
2. **Ollama** running locally at `http://localhost:11434` (`ollama serve`)
3. **Embedding model** pulled in Ollama:
   ```bash
   ollama pull nomic-embed-text:latest
   ```
4. **Chat models** registered in Ollama matching the `.gguf` filenames in `rag_data/` (or configured in `Oracle_Config.ts`), for example:
   - `gemma-2-2b-it-IQ3_M`
   - `gemma-2-2b-it-Q3_K_L`
   - `gemma-2-2b-it-Q4_K_M`
   - `gemma-3-1b-it-Q3_K_L`
   - `phi3-mini-q3kl`

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm run dev
```

`npm run dev` automatically:
1. Runs `generate_config.js` (`npm run config`) to scan `rag_data/` for `.gguf` files and generate `src/model_list.js`.
2. Launches the Next.js development server via `scripts/dev.mjs` and warms up `/` and `/api/status`.

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Generates the model list from `rag_data/` and starts the Next.js dev server with route warmup |
| `npm run config` | Scans `rag_data/*.gguf` and writes available model tags to `src/model_list.js` |
| `npm run build` | Runs `prebuild` (`generate_config.js`) and builds the production app with Turbopack |
| `npm run start` | Starts the production Next.js server |

### Rebuilding the HNSW Vector Index

If you update `rag_data/oracle_dataset_for_RAG.json`, regenerate `rag_data/hnswlib.dat` and `rag_data/args.json` using `create_hnsw_index.ts` (requires Ollama running with `nomic-embed-text:latest`).

## API Overview

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/status` | `GET` | Returns `{ model, rag, availableModels }` and triggers non‑blocking RAG retriever warmup |
| `/api/model` | `GET` | Returns `{ current, available }` models |
| `/api/model` | `POST` | Switches the active model (`{ model: string }`) |
| `/api/persona` | `GET` | Returns the active system persona (`{ persona: string }`) |
| `/api/persona` | `POST` | Updates the active in‑memory system persona (`{ persona: string }`) |
| `/api/chat` | `POST` | Retrieves top‑k lore context from HNSWLib and streams the Oracle's response |

## Configuration

Edit [`Oracle_Config.ts`](./Oracle_Config.ts) to customize defaults:

- `OLLAMA_BASE_URL` — Ollama server URL (default: `"http://localhost:11434"`)
- `EMBEDDING_MODEL_NAME` — Embedding model for HNSWLib queries (default: `"nomic-embed-text:latest"`)
- `DEFAULT_CHAT_MODEL_NAME` — Initial chat model loaded on startup (default: `"gemma-2-2b-it-IQ3_M"`)
- `TEMPERATURE` — Generation temperature (default: `0.7`)
- `FAISS_PATH` — Directory containing the HNSWLib index and `.gguf` files (default: `"rag_data"`)
- `ORACLE_DEFAULT_SYSTEM_PERSONA` — Default system prompt for the Oracle persona
