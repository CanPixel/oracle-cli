//! Turns chat messages into a prompt using the model's own chat template.
//!
//! llama.cpp's built-in template engine only recognises a fixed list of
//! formats, so the GGUF's Jinja template is rendered with minijinja first and
//! llama.cpp's engine is the fallback.

use crate::engine::ChatMessage;
use llama_cpp_2::model::{LlamaChatMessage, LlamaModel};
use llama_cpp_2::token::LlamaToken;
use minijinja::{context, Environment, Error, ErrorKind};

pub fn render(model: &LlamaModel, messages: &[ChatMessage]) -> String {
    let template = model.chat_template(None).ok().and_then(|t| t.to_string().ok());
    if let Some(tmpl) = &template {
        if let Ok(p) = render_jinja(model, tmpl, messages) {
            return p;
        }
        // Some templates reject a system role; fold it into the first user turn.
        if let Ok(p) = render_jinja(model, tmpl, &fold_system(messages)) {
            return p;
        }
        if let Ok(t) = model.chat_template(None) {
            let chat: Vec<_> = messages
                .iter()
                .filter_map(|m| LlamaChatMessage::new(m.role.clone(), m.content.clone()).ok())
                .collect();
            if let Ok(p) = model.apply_chat_template(&t, &chat, true) {
                return p;
            }
        }
    }
    // No usable template: plain transcript.
    let mut p = String::new();
    for m in messages {
        p.push_str(&format!("{}: {}\n\n", m.role.to_uppercase(), m.content));
    }
    p.push_str("ASSISTANT:");
    p
}

/// Tokenizes a rendered prompt, adding BOS only if the template didn't.
pub fn tokenize(model: &LlamaModel, prompt: &str) -> Vec<LlamaToken> {
    let bos = token_text(model, model.vocab().bos());
    let has_bos = !bos.is_empty() && prompt.starts_with(&bos);
    model.vocab().tokenize(prompt.as_bytes(), !has_bos, true)
}

fn render_jinja(model: &LlamaModel, tmpl: &str, messages: &[ChatMessage]) -> Result<String, Error> {
    let mut env = Environment::new();
    minijinja_contrib::add_to_environment(&mut env);
    env.set_unknown_method_callback(minijinja_contrib::pycompat::unknown_method_callback);
    env.add_function("raise_exception", |msg: String| -> Result<String, Error> {
        Err(Error::new(ErrorKind::InvalidOperation, msg))
    });
    env.add_function("strftime_now", |_fmt: String| today());
    let vocab = model.vocab();
    env.render_str(
        tmpl,
        context! {
            messages => messages,
            add_generation_prompt => true,
            enable_thinking => false,
            bos_token => token_text(model, vocab.bos()),
            eos_token => token_text(model, vocab.eos()),
        },
    )
}

fn fold_system(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let system: Vec<&str> = messages.iter().filter(|m| m.role == "system").map(|m| m.content.as_str()).collect();
    let mut out: Vec<ChatMessage> = messages.iter().filter(|m| m.role != "system").cloned().collect();
    if let Some(first) = out.iter_mut().find(|m| m.role == "user") {
        first.content = format!("{}\n\n{}", system.join("\n\n"), first.content);
    }
    out
}

fn token_text(model: &LlamaModel, token: LlamaToken) -> String {
    if token.0 < 0 {
        return String::new();
    }
    model.vocab().text(token).map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Today's date as "19 Oct 2026", for templates that call `strftime_now`.
fn today() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    // Civil-from-days (Howard Hinnant).
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    format!("{day} {} {year}", MONTHS[(month - 1) as usize])
}
