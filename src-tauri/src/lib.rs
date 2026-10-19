pub mod bench;
pub mod engine;
pub mod models;
pub mod persona;
pub mod rag;
mod template;

use engine::{ChatMessage, Engine, GenParams, GenStats};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;

/// The repo root: `$ORACLE_HOME`, else the nearest ancestor of the working
/// directory containing `rag_data/`, else the source checkout.
pub fn project_dir() -> PathBuf {
    if let Some(home) = std::env::var_os("ORACLE_HOME") {
        return home.into();
    }
    let mut dir = std::env::current_dir().ok();
    while let Some(d) = dir {
        if d.join("rag_data").is_dir() {
            return d;
        }
        dir = d.parent().map(Path::to_path_buf);
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().expect("src-tauri has a parent").to_path_buf()
}

struct App {
    engine: Arc<Engine>,
    bench_dir: PathBuf,
}

type CmdResult<T> = Result<T, String>;

/// Runs blocking llama.cpp work off the async runtime.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> anyhow::Result<T> + Send + 'static) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

#[derive(Serialize)]
struct Status {
    models: Vec<models::ModelInfo>,
    loaded: Option<String>,
    rag: rag::RagStatus,
    data_dir: PathBuf,
    default_persona: &'static str,
}

#[tauri::command]
fn status(app: State<'_, App>) -> Status {
    Status {
        models: app.engine.models(),
        loaded: app.engine.loaded_chat_model(),
        rag: app.engine.rag_status(),
        data_dir: app.engine.data_dir.clone(),
        default_persona: persona::DEFAULT_PERSONA,
    }
}

#[tauri::command]
async fn load_model(app: State<'_, App>, id: String) -> CmdResult<Option<f64>> {
    let engine = app.engine.clone();
    blocking(move || engine.load_chat(&id)).await
}

#[tauri::command]
fn cancel(app: State<'_, App>) {
    app.engine.cancel();
}

#[derive(Deserialize)]
struct ChatRequest {
    model: String,
    persona: String,
    corruption: u8,
    use_rag: bool,
    history: Vec<ChatMessage>,
    prompt: String,
    params: GenParams,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
enum ChatEvent {
    Lore { docs: Vec<String> },
    Token { text: String },
}

#[derive(Serialize)]
struct ChatReply {
    text: String,
    stats: GenStats,
}

#[tauri::command]
async fn chat(app: State<'_, App>, req: ChatRequest, on_event: Channel<ChatEvent>) -> CmdResult<ChatReply> {
    let engine = app.engine.clone();
    blocking(move || {
        engine.reset_cancel();
        let lore = if req.use_rag { engine.retrieve(&req.prompt, 3)? } else { vec![] };
        let _ = on_event.send(ChatEvent::Lore { docs: lore.clone() });
        let mut messages = vec![ChatMessage::new("system", persona::system_prompt(&req.persona, req.corruption, &lore))];
        messages.extend(req.history);
        messages.push(ChatMessage::new("user", req.prompt));
        let out = engine.generate(&req.model, &messages, &req.params, &mut |t| {
            let _ = on_event.send(ChatEvent::Token { text: t.to_owned() });
        })?;
        Ok(ChatReply { text: out.text, stats: out.stats })
    })
    .await
}

#[tauri::command]
fn get_suite(app: State<'_, App>) -> CmdResult<bench::Suite> {
    bench::load_suite(&app.bench_dir).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn run_bench(app: State<'_, App>, req: bench::BenchRequest, on_event: Channel<bench::Progress>) -> CmdResult<bench::Report> {
    let engine = app.engine.clone();
    let dir = app.bench_dir.clone();
    blocking(move || bench::run(&engine, &dir, req, &mut |p| {
        let _ = on_event.send(p);
    }))
    .await
}

#[tauri::command]
fn list_reports(app: State<'_, App>) -> Vec<bench::ReportMeta> {
    bench::list_reports(&app.bench_dir)
}

#[tauri::command]
fn load_report(app: State<'_, App>, id: String) -> CmdResult<bench::Report> {
    bench::load_report(&app.bench_dir, &id).map_err(|e| format!("{e:#}"))
}

pub fn run() {
    let root = project_dir();
    let engine = Arc::new(Engine::new(root.join("rag_data")).expect("failed to initialise llama.cpp"));
    let on_exit = engine.clone();
    tauri::Builder::default()
        .manage(App { engine, bench_dir: root.join("bench") })
        .invoke_handler(tauri::generate_handler![
            status, load_model, cancel, chat, get_suite, run_bench, list_reports, load_report
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_, event| {
            if let tauri::RunEvent::Exit = event {
                on_exit.cancel();
                on_exit.unload_all();
            }
        });
}
