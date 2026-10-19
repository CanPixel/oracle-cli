# The Oracle

A native desktop app (Tauri + React) for testing local GGUF models through
[llama.cpp](https://github.com/ggml-org/llama.cpp) (via the `llama-cpp-2` crate, Metal on macOS). You can chat with a
cursed starship AI, and benchmark models against each other on speed, staying in character, and following instructions.
No Ollama or other server is needed.

## Models

Any `*.gguf` in `rag_data/` is picked up at runtime. Symlink models there; you don't need to copy them:

```bash
ln -s ~/Models/gemma-4-E4B_q4_0-it.gguf rag_data/
```

Each file's GGUF header is read without loading weights. Models are classified like this:

- **chat**: everything with a chat template. These show up in the model pickers.
- **embedding**: `*embed*` / BERT-family files. The first one is used for lore retrieval. `nomic-embed-text` works well.
- **reranker / projector** (`mmproj-*`) files are listed but ignored.

Press **RESCAN** in the header after adding or removing links. Each model's own Jinja chat template is used, and
llama.cpp's built-in templates are the fallback.

## Running

Requirements: Rust (stable), Node 20+, CMake, and Xcode command line tools on macOS.

```bash
npm install
npm run dev      # tauri dev: Vite on :1420 + the native window
npm run build    # bundled .app / .dmg in src-tauri/target/release/bundle
```

The first build compiles llama.cpp and takes a few minutes. llama.cpp is always built optimized, even in dev.

## Chat

- Pick a model from the dropdown. Switching unloads the previous model and reports the load time.
- Under each reply: time to first token, generation tok/s, token counts and stop reason. You can expand the lore that
  was retrieved for that reply.
- **CONFIG** opens the persona editor, corruption level (0–100, adds escalating instructions to the system prompt), a
  RAG toggle, and sampling parameters.

## Benchmarking

The **BENCH** tab and the headless CLI run `bench/suite.json` against the selected models. Every run is saved to
`bench/results/<timestamp>.json`. Past runs can be reopened from the Bench tab.

```bash
npm run bench                                   # all chat models, rules only
npm run bench -- --judge gemma-4-E4B_q4_0-it    # add LLM-judge scores
npm run bench -- --case all-caps --case word-limit MiniCPM5-1B-Q8_0
npm run bench -- --help
```

What gets measured for each model:

| Metric | How |
| :--- | :--- |
| load ms | Cold model load (the previous model is unloaded first) |
| ttft ms | Request start to first token: template, prompt eval, first sample |
| prompt / gen t/s | Prompt-eval and generation throughput |
| rules | Share of deterministic checks passed, overall and per category |
| in-char / instr / quality | 1–10 scores from a local **judge** model. Output is constrained by a GBNF grammar so it always parses |

Judging runs after all generations, so the judge model is loaded only once. Use your strongest model as the judge,
because small models score leniently. Every model sees the same retrieved lore for a given case.

### Writing cases

```jsonc
{
  "id": "word-limit",
  "category": "instructions",          // grouped in the summary table
  "prompt": "In ten words or fewer: what happened to the crew?",
  "history": [],                       // optional prior turns
  "corruption": 0,                     // 0-100
  "defaults": true,                    // also apply suite-level default_checks
  "checks": [{ "type": "max_words", "n": 10 }],
  "expect": "Ten words or fewer, still ominous."  // shown to the judge
}
```

Available checks: `max_sentences`, `max_words`, `min_words`, `contains_any`, `contains_all`, `forbid` (all with
`words` and an optional `label`), and `all_caps`. Word matching is case-insensitive and respects word boundaries.

## Lore (RAG)

`rag_data/oracle_dataset_for_RAG.json` is embedded with the embedding model the first time it's needed. The vectors
are cached in `rag_data/.lore-<model>.json` and rebuilt automatically when the dataset changes. Retrieval is a
brute-force cosine top-3 over about 500 entries.

## Layout

```
src/                  React UI (App, components/Chat, components/Bench, api.ts)
src-tauri/src/
  engine.rs           model loading, generation with timing stats, embeddings
  template.rs         chat-template rendering (minijinja → llama.cpp fallback)
  models.rs           GGUF discovery and metadata
  rag.rs              lore embedding cache and retrieval
  persona.rs          Oracle persona, corruption levels, system prompt assembly
  bench.rs            suite runner, rule checks, judge, reports
  bin/bench.rs        headless CLI
bench/suite.json      benchmark cases
rag_data/             lore dataset and symlinked models
```

`ORACLE_HOME` overrides the project root. By default it's found by walking up from the working directory to the first
directory containing `rag_data/`.
