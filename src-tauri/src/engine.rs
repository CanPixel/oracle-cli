//! llama.cpp inference: one resident chat model, one resident embedding model.

use crate::models::{self, ModelInfo};
use crate::template;
use anyhow::{anyhow, bail, Context, Result};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn new(role: &str, content: impl Into<String>) -> Self {
        Self { role: role.into(), content: content.into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GenParams {
    pub temperature: f32,
    pub top_k: i32,
    pub top_p: f32,
    pub min_p: f32,
    pub repeat_penalty: f32,
    pub max_tokens: u32,
    pub seed: u32,
    pub n_ctx: u32,
    /// GBNF grammar constraining the output (used by the bench judge).
    #[serde(skip)]
    pub grammar: Option<String>,
}

impl Default for GenParams {
    fn default() -> Self {
        Self {
            temperature: 0.7,
            top_k: 40,
            top_p: 0.95,
            min_p: 0.05,
            repeat_penalty: 1.1,
            max_tokens: 256,
            seed: 42,
            n_ctx: 4096,
            grammar: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GenStats {
    pub model: String,
    /// Set when this call had to load the model first.
    pub load_ms: Option<f64>,
    pub prompt_tokens: usize,
    pub prompt_ms: f64,
    /// From request start (model already resident) to first token.
    pub ttft_ms: f64,
    pub gen_tokens: usize,
    pub gen_ms: f64,
    pub prompt_tps: f64,
    pub gen_tps: f64,
    pub total_ms: f64,
    /// "eos", "length" or "cancelled".
    pub stop_reason: String,
}

pub struct Output {
    pub text: String,
    pub stats: GenStats,
}

struct Loaded {
    id: String,
    model: LlamaModel,
}

pub struct Engine {
    backend: LlamaBackend,
    pub data_dir: PathBuf,
    chat: Mutex<Option<Loaded>>,
    /// Id of the resident chat model; readable while `chat` is busy generating.
    chat_id: Mutex<Option<String>>,
    embed: Mutex<Option<Loaded>>,
    stop: AtomicBool,
    pub(crate) lore: Mutex<Option<std::sync::Arc<crate::rag::Lore>>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn ms(since: Instant) -> f64 {
    since.elapsed().as_secs_f64() * 1000.0
}

impl Engine {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        llama_cpp_2::send_logs_to_tracing(llama_cpp_2::LogOptions::default().with_logs_enabled(false));
        Ok(Self {
            backend: LlamaBackend::init()?,
            data_dir,
            chat: Mutex::new(None),
            chat_id: Mutex::new(None),
            embed: Mutex::new(None),
            stop: AtomicBool::new(false),
            lore: Mutex::new(None),
        })
    }

    pub fn models(&self) -> Vec<ModelInfo> {
        models::discover(&self.data_dir)
    }

    pub fn find(&self, id: &str) -> Result<ModelInfo> {
        self.models()
            .into_iter()
            .find(|m| m.id == id)
            .ok_or_else(|| anyhow!("model '{id}' not found in {}", self.data_dir.display()))
    }

    pub fn loaded_chat_model(&self) -> Option<String> {
        lock(&self.chat_id).clone()
    }

    /// Loads `id` as the chat model (replacing any other). Returns the load
    /// time, or `None` if it was already resident.
    pub fn load_chat(&self, id: &str) -> Result<Option<f64>> {
        self.ensure_chat(&mut lock(&self.chat), id)
    }

    pub fn unload_chat(&self) {
        *lock(&self.chat) = None;
        *lock(&self.chat_id) = None;
    }

    /// Frees all Metal/GPU buffers. ggml asserts if any are alive at process exit.
    pub fn unload_all(&self) {
        self.unload_chat();
        *lock(&self.embed) = None;
    }

    fn ensure_chat(&self, slot: &mut Option<Loaded>, id: &str) -> Result<Option<f64>> {
        *lock(&self.chat_id) = None;
        let loaded = self.ensure(slot, id)?;
        *lock(&self.chat_id) = Some(id.to_owned());
        Ok(loaded)
    }

    /// Stops the running generation (and benchmark) at the next token.
    pub fn cancel(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    /// Call at the start of each user-initiated operation.
    pub fn reset_cancel(&self) {
        self.stop.store(false, Ordering::SeqCst);
    }

    pub fn cancelled(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }

    fn ensure(&self, slot: &mut Option<Loaded>, id: &str) -> Result<Option<f64>> {
        if slot.as_ref().is_some_and(|l| l.id == id) {
            return Ok(None);
        }
        let info = self.find(id)?;
        *slot = None; // free the old weights before mapping new ones
        let t = Instant::now();
        let params = LlamaModelParams::default().with_n_gpu_layers(999);
        let model = LlamaModel::load_from_file(&self.backend, &info.path, &params)
            .with_context(|| format!("loading {}", info.path.display()))?;
        *slot = Some(Loaded { id: id.to_owned(), model });
        Ok(Some(ms(t)))
    }

    /// Generates a reply, calling `on_token` with each decoded text piece.
    pub fn generate(
        &self,
        model_id: &str,
        messages: &[ChatMessage],
        p: &GenParams,
        on_token: &mut dyn FnMut(&str),
    ) -> Result<Output> {
        let mut slot = lock(&self.chat);
        let load_ms = self.ensure_chat(&mut slot, model_id)?;
        let model = &slot.as_ref().expect("just loaded").model;
        let start = Instant::now();

        let prompt = template::render(model, messages);
        let tokens = template::tokenize(model, &prompt);
        let n_ctx = p.n_ctx.clamp(512, model.n_ctx_train().max(512));
        if tokens.len() + 8 >= n_ctx as usize {
            bail!("prompt is {} tokens but the context is {n_ctx}", tokens.len());
        }
        let max_new = (p.max_tokens as usize).min(n_ctx as usize - tokens.len());

        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(NonZeroU32::new(n_ctx))
            .with_n_batch(n_ctx);
        let mut ctx = model.new_context(&self.backend, ctx_params)?;

        let t_prompt = Instant::now();
        let mut batch = LlamaBatch::new(n_ctx as usize, 1);
        let last = tokens.len() - 1;
        for (i, &t) in tokens.iter().enumerate() {
            batch.add(t, i as i32, &[0], i == last)?;
        }
        ctx.decode(&mut batch)?;
        let prompt_ms = ms(t_prompt);

        let mut sampler = sampler(model, p);
        let vocab = model.vocab();
        let mut utf8 = encoding_rs::UTF_8.new_decoder();
        let mut text = String::new();
        let mut ttft_ms = 0.0;
        let mut gen_tokens = 0;
        let mut stop_reason = "length";
        let t_gen = Instant::now();

        for pos in tokens.len()..tokens.len() + max_new {
            if self.stop.load(Ordering::SeqCst) {
                stop_reason = "cancelled";
                break;
            }
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            if vocab.is_eog(token) {
                stop_reason = "eos";
                break;
            }
            if gen_tokens == 0 {
                ttft_ms = ms(start);
            }
            gen_tokens += 1;

            let bytes = vocab.token_to_piece(token, false, None);
            let mut piece = String::with_capacity(bytes.len() + 4);
            let _ = utf8.decode_to_string(&bytes, &mut piece, false);
            if !piece.is_empty() {
                text.push_str(&piece);
                on_token(&piece);
            }

            batch.clear();
            batch.add(token, pos as i32, &[0], true)?;
            ctx.decode(&mut batch)?;
        }

        let gen_ms = ms(t_gen);
        let per_sec = |n: usize, ms: f64| if ms > 0.0 { n as f64 * 1000.0 / ms } else { 0.0 };
        Ok(Output {
            text,
            stats: GenStats {
                model: model_id.to_owned(),
                load_ms,
                prompt_tokens: tokens.len(),
                prompt_ms,
                ttft_ms,
                gen_tokens,
                gen_ms,
                prompt_tps: per_sec(tokens.len(), prompt_ms),
                gen_tps: per_sec(gen_tokens, gen_ms),
                total_ms: ms(start),
                stop_reason: stop_reason.into(),
            },
        })
    }

    /// Normalized embeddings, one per input, from embedding model `id`.
    pub fn embed(&self, id: &str, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let mut slot = lock(&self.embed);
        self.ensure(&mut slot, id)?;
        let model = &slot.as_ref().expect("just loaded").model;
        let n_ctx = model.n_ctx_train().min(2048);
        let params = LlamaContextParams::default()
            .with_embeddings(true)
            .with_n_ctx(NonZeroU32::new(n_ctx))
            .with_n_batch(n_ctx)
            .with_n_ubatch(n_ctx);
        let mut ctx = model.new_context(&self.backend, params)?;
        let mut batch = LlamaBatch::new(n_ctx as usize, 1);

        texts
            .iter()
            .map(|text| {
                let mut tokens = model.vocab().tokenize(text.as_bytes(), true, false);
                tokens.truncate(n_ctx as usize);
                ctx.clear_kv_cache();
                batch.clear();
                for (i, &t) in tokens.iter().enumerate() {
                    batch.add(t, i as i32, &[0], true)?;
                }
                ctx.decode(&mut batch)?;
                let v = ctx.embeddings_seq_ith(0)?;
                let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
                Ok(v.iter().map(|x| x / norm).collect())
            })
            .collect()
    }
}

fn sampler(model: &LlamaModel, p: &GenParams) -> LlamaSampler {
    let mut chain: Vec<LlamaSampler> = p
        .grammar
        .as_deref()
        .and_then(|g| LlamaSampler::grammar(model, g, "root").ok())
        .into_iter()
        .collect();
    chain.push(LlamaSampler::penalties(model.n_vocab(), 64, p.repeat_penalty, 0.0, 0.0));
    if p.temperature <= 0.0 {
        chain.push(LlamaSampler::greedy());
        return LlamaSampler::chain_simple(chain);
    }
    chain.extend([
        LlamaSampler::top_k(p.top_k),
        LlamaSampler::top_p(p.top_p, 1),
        LlamaSampler::min_p(p.min_p, 1),
        LlamaSampler::temp(p.temperature),
        LlamaSampler::dist(p.seed),
    ]);
    LlamaSampler::chain_simple(chain)
}
