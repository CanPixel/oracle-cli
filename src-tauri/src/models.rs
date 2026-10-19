//! Discovers GGUF models (usually symlinks) in the data directory and reads
//! their metadata header without loading weights.

use llama_cpp_2::gguf::GgufContext;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelKind {
    Chat,
    Embedding,
    Reranker,
    Projector,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    /// File stem; used as the model id everywhere.
    pub id: String,
    pub path: PathBuf,
    pub kind: ModelKind,
    pub arch: String,
    pub name: Option<String>,
    pub size_label: Option<String>,
    pub quant: Option<String>,
    pub size_bytes: u64,
    pub context_length: Option<u64>,
    pub has_chat_template: bool,
}

/// Lists every `*.gguf` in `dir`, following symlinks. Broken links and
/// unreadable files are skipped.
pub fn discover(dir: &Path) -> Vec<ModelInfo> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut models: Vec<ModelInfo> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("gguf")))
        .filter_map(|p| inspect(&p))
        .collect();
    models.sort_by_key(|m| m.id.to_lowercase());
    models
}

pub fn inspect(path: &Path) -> Option<ModelInfo> {
    let size_bytes = std::fs::metadata(path).ok()?.len(); // follows symlinks
    let gguf = GgufContext::from_file(path)?;
    let id = path.file_stem()?.to_string_lossy().into_owned();
    let arch = get_str(&gguf, "general.architecture").unwrap_or_default();
    let pooling = get_int(&gguf, &format!("{arch}.pooling_type"));
    let has_chat_template = gguf.find_key("tokenizer.chat_template") >= 0;
    let lower = id.to_lowercase();

    let kind = if arch == "clip" || lower.starts_with("mmproj") {
        ModelKind::Projector
    } else if lower.contains("rerank") || pooling == Some(4) {
        ModelKind::Reranker
    } else if lower.contains("embed") || arch.contains("bert") || (pooling.is_some() && !has_chat_template) {
        ModelKind::Embedding
    } else {
        ModelKind::Chat
    };

    Some(ModelInfo {
        id,
        path: path.to_path_buf(),
        kind,
        name: get_str(&gguf, "general.name"),
        size_label: get_str(&gguf, "general.size_label"),
        quant: get_int(&gguf, "general.file_type").and_then(ftype_name).map(str::to_owned),
        context_length: get_int(&gguf, &format!("{arch}.context_length")),
        arch,
        size_bytes,
        has_chat_template,
    })
}

fn get_str(g: &GgufContext, key: &str) -> Option<String> {
    let i = g.find_key(key);
    (i >= 0 && g.kv_type(i) == GGUF_TYPE_STRING)
        .then(|| g.val_str(i).map(str::to_owned))
        .flatten()
}

fn get_int(g: &GgufContext, key: &str) -> Option<u64> {
    let i = g.find_key(key);
    if i < 0 {
        return None;
    }
    // The C accessors abort on a type mismatch, so check the type first.
    match g.kv_type(i) {
        GGUF_TYPE_UINT32 => Some(g.val_u32(i) as u64),
        GGUF_TYPE_INT32 => u64::try_from(g.val_i32(i)).ok(),
        GGUF_TYPE_UINT64 => Some(g.val_u64(i)),
        _ => None,
    }
}

const GGUF_TYPE_UINT32: u32 = 4;
const GGUF_TYPE_INT32: u32 = 5;
const GGUF_TYPE_STRING: u32 = 8;
const GGUF_TYPE_UINT64: u32 = 10;

/// `llama_ftype` → quantization label.
fn ftype_name(ftype: u64) -> Option<&'static str> {
    Some(match ftype {
        0 => "F32",
        1 => "F16",
        2 => "Q4_0",
        3 => "Q4_1",
        7 => "Q8_0",
        8 => "Q5_0",
        9 => "Q5_1",
        10 => "Q2_K",
        11 => "Q3_K_S",
        12 => "Q3_K_M",
        13 => "Q3_K_L",
        14 => "Q4_K_S",
        15 => "Q4_K_M",
        16 => "Q5_K_S",
        17 => "Q5_K_M",
        18 => "Q6_K",
        19 => "IQ2_XXS",
        20 => "IQ2_XS",
        21 => "Q2_K_S",
        22 => "IQ3_XS",
        23 => "IQ3_XXS",
        24 => "IQ1_S",
        25 => "IQ4_NL",
        26 => "IQ3_S",
        27 => "IQ3_M",
        28 => "IQ2_S",
        29 => "IQ2_M",
        30 => "IQ4_XS",
        31 => "IQ1_M",
        32 => "BF16",
        36 => "TQ1_0",
        37 => "TQ2_0",
        38 => "MXFP4",
        _ => return None,
    })
}
