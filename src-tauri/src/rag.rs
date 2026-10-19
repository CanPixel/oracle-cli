//! Lore retrieval: embeds `oracle_dataset_for_RAG.json` with the first
//! embedding model found in the data dir and does brute-force cosine search.
//! Vectors are cached next to the dataset, keyed by model and content hash.

use crate::engine::Engine;
use crate::models::ModelKind;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub const DATASET_FILE: &str = "oracle_dataset_for_RAG.json";

pub struct Lore {
    pub embed_model: String,
    docs: Vec<String>,
    vecs: Vec<Vec<f32>>,
}

#[derive(Deserialize)]
struct Entry {
    retrieved_lore: String,
}

#[derive(Serialize, Deserialize)]
struct Cache {
    hash: String,
    vecs: Vec<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RagStatus {
    pub embed_model: Option<String>,
    pub docs: usize,
    pub ready: bool,
}

impl Engine {
    pub fn rag_status(&self) -> RagStatus {
        if let Some(lore) = self.lore.try_lock().ok().and_then(|g| g.clone()) {
            return RagStatus { embed_model: Some(lore.embed_model.clone()), docs: lore.docs.len(), ready: true };
        }
        let embed_model = self.models().into_iter().find(|m| m.kind == ModelKind::Embedding).map(|m| m.id);
        RagStatus { embed_model, docs: 0, ready: false }
    }

    /// Builds (or returns the already built) lore index.
    pub fn lore(&self) -> Result<Arc<Lore>> {
        let mut slot = self.lore.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(lore) = slot.as_ref() {
            return Ok(lore.clone());
        }
        let model = self
            .models()
            .into_iter()
            .find(|m| m.kind == ModelKind::Embedding)
            .ok_or_else(|| anyhow!("no embedding model (e.g. nomic-embed-text) in {}", self.data_dir.display()))?;

        let raw = std::fs::read(self.data_dir.join(DATASET_FILE)).context("reading lore dataset")?;
        let docs: Vec<String> = serde_json::from_slice::<Vec<Entry>>(&raw)?
            .into_iter()
            .map(|e| e.retrieved_lore)
            .collect();

        let hash = format!("{:016x}", fnv1a(&raw));
        let cache_path = self.data_dir.join(format!(".lore-{}.json", model.id));
        let cached = std::fs::read(&cache_path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Cache>(&b).ok())
            .filter(|c| c.hash == hash && c.vecs.len() == docs.len());

        let vecs = match cached {
            Some(c) => c.vecs,
            None => {
                let inputs: Vec<String> = docs.iter().map(|d| format!("{}{d}", doc_prefix(&model.id))).collect();
                let vecs = self.embed(&model.id, &inputs)?;
                let _ = std::fs::write(&cache_path, serde_json::to_vec(&Cache { hash, vecs: vecs.clone() })?);
                vecs
            }
        };

        let lore = Arc::new(Lore { embed_model: model.id, docs, vecs });
        *slot = Some(lore.clone());
        Ok(lore)
    }

    /// Top-`k` lore entries for `query`.
    pub fn retrieve(&self, query: &str, k: usize) -> Result<Vec<String>> {
        let lore = self.lore()?;
        let q = self.embed(&lore.embed_model, &[format!("{}{query}", query_prefix(&lore.embed_model))])?.remove(0);
        let mut scored: Vec<(f32, usize)> = lore
            .vecs
            .iter()
            .enumerate()
            .map(|(i, v)| (v.iter().zip(&q).map(|(a, b)| a * b).sum(), i))
            .collect();
        scored.sort_by(|a, b| b.0.total_cmp(&a.0));
        Ok(scored.into_iter().take(k).map(|(_, i)| lore.docs[i].clone()).collect())
    }
}

/// Task prefixes the common embedding models were trained with.
fn doc_prefix(model: &str) -> &'static str {
    if model.to_lowercase().contains("nomic") { "search_document: " } else { "" }
}

fn query_prefix(model: &str) -> &'static str {
    let m = model.to_lowercase();
    if m.contains("nomic") {
        "search_query: "
    } else if m.contains("qwen") {
        "Instruct: Given a question, retrieve relevant starship lore\nQuery: "
    } else {
        ""
    }
}

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |h, &b| (h ^ b as u64).wrapping_mul(0x100000001b3))
}
