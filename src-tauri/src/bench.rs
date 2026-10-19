//! Runs a test suite across models and scores each reply with rule checks
//! and, optionally, a local judge model.

use crate::engine::{ChatMessage, Engine, GenParams, GenStats};
use crate::persona;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

// ---------- suite ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suite {
    pub name: String,
    /// Overrides the default Oracle persona.
    #[serde(default)]
    pub persona: Option<String>,
    /// Applied to every case unless the case sets `"defaults": false`.
    #[serde(default)]
    pub default_checks: Vec<Check>,
    pub cases: Vec<Case>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Case {
    pub id: String,
    pub category: String,
    pub prompt: String,
    #[serde(default)]
    pub history: Vec<ChatMessage>,
    #[serde(default)]
    pub corruption: u8,
    #[serde(default = "yes")]
    pub defaults: bool,
    #[serde(default)]
    pub checks: Vec<Check>,
    /// Tells the judge what a good answer looks like.
    #[serde(default)]
    pub expect: Option<String>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Check {
    MaxSentences { n: usize },
    MaxWords { n: usize },
    MinWords { n: usize },
    /// Passes if any of `words` appears (case-insensitive, whole word for alphanumerics).
    ContainsAny { words: Vec<String>, #[serde(default)] label: Option<String> },
    ContainsAll { words: Vec<String>, #[serde(default)] label: Option<String> },
    /// Fails if any of `words` appears.
    Forbid { words: Vec<String>, #[serde(default)] label: Option<String> },
    AllCaps,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    pub name: String,
    pub pass: bool,
    pub detail: String,
}

impl Check {
    pub fn eval(&self, text: &str) -> CheckResult {
        let lower = text.to_lowercase();
        let found = |words: &[String]| -> Vec<String> {
            words.iter().filter(|w| contains_word(&lower, &w.to_lowercase())).cloned().collect()
        };
        let (name, pass, detail) = match self {
            Check::MaxSentences { n } => {
                let c = count_sentences(text);
                (format!("≤{n} sentences"), c <= *n, format!("{c} sentences"))
            }
            Check::MaxWords { n } => {
                let c = text.split_whitespace().count();
                (format!("≤{n} words"), c <= *n, format!("{c} words"))
            }
            Check::MinWords { n } => {
                let c = text.split_whitespace().count();
                (format!("≥{n} words"), c >= *n, format!("{c} words"))
            }
            Check::ContainsAny { words, label } => {
                let f = found(words);
                (label.clone().unwrap_or_else(|| format!("any of {}", words.join("/"))), !f.is_empty(), f.join(", "))
            }
            Check::ContainsAll { words, label } => {
                let f = found(words);
                let missing: Vec<_> = words.iter().filter(|w| !f.contains(w)).cloned().collect();
                (
                    label.clone().unwrap_or_else(|| format!("all of {}", words.join("/"))),
                    missing.is_empty(),
                    if missing.is_empty() { String::new() } else { format!("missing {}", missing.join(", ")) },
                )
            }
            Check::Forbid { words, label } => {
                let f = found(words);
                (label.clone().unwrap_or_else(|| "forbidden words".into()), f.is_empty(), f.join(", "))
            }
            Check::AllCaps => {
                let letters: Vec<char> = text.chars().filter(|c| c.is_alphabetic()).collect();
                let upper = letters.iter().filter(|c| c.is_uppercase()).count();
                let ratio = if letters.is_empty() { 0.0 } else { upper as f64 / letters.len() as f64 };
                ("ALL CAPS".into(), ratio >= 0.9, format!("{:.0}% upper", ratio * 100.0))
            }
        };
        CheckResult { name, pass, detail }
    }
}

/// Substring match; alphanumeric needles must sit on word boundaries.
fn contains_word(hay: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    let edge = |c: Option<char>| c.is_none_or(|c| !c.is_alphanumeric());
    let first_alnum = needle.chars().next().is_some_and(char::is_alphanumeric);
    let last_alnum = needle.chars().last().is_some_and(char::is_alphanumeric);
    hay.match_indices(needle).any(|(i, m)| {
        (!first_alnum || edge(hay[..i].chars().last())) && (!last_alnum || edge(hay[i + m.len()..].chars().next()))
    })
}

/// Rough count: runs of . ! ? (or line breaks) end a sentence; fragments
/// with fewer than two words (glitch tokens, log headers) don't count.
fn count_sentences(text: &str) -> usize {
    text.split(['.', '!', '?', '\n', '…'])
        .filter(|s| s.split_whitespace().filter(|w| w.chars().any(char::is_alphabetic)).count() >= 2)
        .count()
}

/// Drops `<think>…</think>` blocks some models emit before answering.
pub fn strip_thinking(text: &str) -> String {
    let mut out = text.to_owned();
    while let (Some(a), Some(b)) = (out.find("<think>"), out.find("</think>")) {
        if b < a {
            break;
        }
        out.replace_range(a..b + "</think>".len(), "");
    }
    out.trim().to_owned()
}

// ---------- judge ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Judgement {
    pub in_character: f64,
    pub instructions: f64,
    pub quality: f64,
    pub note: String,
}

const JUDGE_GRAMMAR: &str = r#"
root  ::= "{" ws "\"in_character\":" ws score "," ws "\"instructions\":" ws score "," ws "\"quality\":" ws score "," ws "\"note\":" ws note ws "}"
score ::= "10" | [1-9]
note  ::= "\"" [^"\\\n]{0,240} "\""
ws    ::= [ \n]?
"#;

fn judge(engine: &Engine, judge: &str, system: &str, case: &Case, reply: &str) -> Result<Judgement> {
    let mut convo = String::new();
    for m in &case.history {
        convo.push_str(&format!("{}: {}\n", m.role.to_uppercase(), m.content));
    }
    let focus = case.expect.clone().unwrap_or_else(|| format!("category: {}", case.category));
    let prompt = format!(
        "CHARACTER SHEET (the system prompt the bot was given):\n<<<\n{system}\n>>>\n\n\
CONVERSATION:\n{convo}USER: {}\nBOT: {reply}\n\n\
WHAT THIS TEST CHECKS: {focus}\n\n\
Score the BOT's final reply from 1 to 10 on each axis:\n\
- in_character: stays fully in the character's voice, tone and world (10) vs. breaks character or sounds like a generic assistant (1).\n\
- instructions: obeys the character sheet's rules (length, style, no slang) and any request in the user's message the character should honour (10) vs. ignores them (1).\n\
- quality: vivid, coherent, original and relevant to the user's message (10) vs. repetitive, garbled or off-topic (1).\n\
Answer with JSON only: {{\"in_character\": n, \"instructions\": n, \"quality\": n, \"note\": \"one short sentence\"}}",
        case.prompt
    );
    let messages = [
        ChatMessage::new("system", "You are a strict, consistent evaluator of role-play chatbot replies."),
        ChatMessage::new("user", prompt),
    ];
    let params = GenParams { temperature: 0.0, max_tokens: 160, grammar: Some(JUDGE_GRAMMAR.into()), ..Default::default() };
    let out = engine.generate(judge, &messages, &params, &mut |_| {})?;
    let text = strip_thinking(&out.text);
    let json = &text[text.find('{').unwrap_or(0)..=text.rfind('}').unwrap_or(text.len().saturating_sub(1))];
    serde_json::from_str(json).with_context(|| format!("judge returned unparseable output: {text}"))
}

// ---------- run ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct BenchRequest {
    pub models: Vec<String>,
    pub judge: Option<String>,
    pub use_rag: bool,
    pub repeats: u32,
    pub params: GenParams,
    /// Runs this suite instead of `bench/suite.json`.
    pub suite: Option<Suite>,
}

impl Default for BenchRequest {
    fn default() -> Self {
        Self { models: vec![], judge: None, use_rag: true, repeats: 1, params: GenParams::default(), suite: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseResult {
    pub model: String,
    pub case_id: String,
    pub category: String,
    pub run: u32,
    pub prompt: String,
    pub output: String,
    pub error: Option<String>,
    pub stats: GenStats,
    pub checks: Vec<CheckResult>,
    pub rule_score: f64,
    pub judge: Option<Judgement>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelSummary {
    pub id: String,
    pub arch: String,
    pub quant: Option<String>,
    pub size_bytes: u64,
    pub load_ms: f64,
    pub avg_ttft_ms: f64,
    pub avg_prompt_tps: f64,
    pub avg_gen_tps: f64,
    pub avg_gen_tokens: f64,
    pub rule_score: f64,
    pub by_category: BTreeMap<String, f64>,
    pub judge_in_character: Option<f64>,
    pub judge_instructions: Option<f64>,
    pub judge_quality: Option<f64>,
    pub errors: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub id: String,
    pub created_at: u64,
    pub suite: String,
    pub params: GenParams,
    pub use_rag: bool,
    pub judge: Option<String>,
    pub summaries: Vec<ModelSummary>,
    pub results: Vec<CaseResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Progress {
    Started { total: usize },
    Loading { model: String },
    CaseStarted { model: String, case_id: String, run: u32, index: usize },
    Token { text: String },
    CaseFinished { index: usize, result: Box<CaseResult> },
    Judging { model: String, case_id: String, index: usize },
    Done { report: Box<Report> },
}

pub fn load_suite(bench_dir: &Path) -> Result<Suite> {
    let path = bench_dir.join("suite.json");
    let raw = std::fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parsing {}", path.display()))
}

pub fn run(engine: &Engine, bench_dir: &Path, req: BenchRequest, emit: &mut dyn FnMut(Progress)) -> Result<Report> {
    let suite = match req.suite {
        Some(s) => s,
        None => load_suite(bench_dir)?,
    };
    if req.models.is_empty() {
        bail!("select at least one model");
    }
    let repeats = req.repeats.max(1);
    let persona = suite.persona.clone().unwrap_or_else(|| persona::DEFAULT_PERSONA.into());
    let total = req.models.len() * suite.cases.len() * repeats as usize * if req.judge.is_some() { 2 } else { 1 };
    emit(Progress::Started { total });
    engine.reset_cancel();

    // Same retrieved lore for every model so the comparison is fair.
    let mut lore: HashMap<&str, Vec<String>> = HashMap::new();
    for case in &suite.cases {
        let docs = if req.use_rag { engine.retrieve(&case.prompt, 3)? } else { vec![] };
        lore.insert(&case.id, docs);
    }

    let mut results = Vec::new();
    let mut load_times = HashMap::new();
    let mut index = 0;

    for model in &req.models {
        emit(Progress::Loading { model: model.clone() });
        engine.unload_chat();
        let load_ms = engine.load_chat(model)?.unwrap_or(0.0);
        load_times.insert(model.clone(), load_ms);

        for run in 0..repeats {
            for case in &suite.cases {
                if engine.cancelled() {
                    bail!("benchmark cancelled");
                }
                emit(Progress::CaseStarted { model: model.clone(), case_id: case.id.clone(), run, index });
                let system = persona::system_prompt(&persona, case.corruption, &lore[case.id.as_str()]);
                let mut messages = vec![ChatMessage::new("system", system)];
                messages.extend(case.history.iter().cloned());
                messages.push(ChatMessage::new("user", &case.prompt));
                let params = GenParams { seed: req.params.seed.wrapping_add(run), ..req.params.clone() };

                let gen = engine.generate(model, &messages, &params, &mut |t| {
                    emit(Progress::Token { text: t.to_owned() })
                });
                let (output, stats, error) = match gen {
                    Ok(o) => (strip_thinking(&o.text), o.stats, None),
                    Err(e) => (String::new(), GenStats { model: model.clone(), ..Default::default() }, Some(e.to_string())),
                };
                let checks: Vec<CheckResult> = if error.is_some() {
                    vec![]
                } else {
                    suite
                        .default_checks
                        .iter()
                        .filter(|_| case.defaults)
                        .chain(&case.checks)
                        .map(|c| c.eval(&output))
                        .collect()
                };
                let rule_score = if checks.is_empty() {
                    if error.is_some() { 0.0 } else { 1.0 }
                } else {
                    checks.iter().filter(|c| c.pass).count() as f64 / checks.len() as f64
                };
                let result = CaseResult {
                    model: model.clone(),
                    case_id: case.id.clone(),
                    category: case.category.clone(),
                    run,
                    prompt: case.prompt.clone(),
                    output,
                    error,
                    stats,
                    checks,
                    rule_score,
                    judge: None,
                };
                emit(Progress::CaseFinished { index, result: Box::new(result.clone()) });
                results.push(result);
                index += 1;
            }
        }
    }

    // Judge after all generations so the judge model is loaded only once.
    if let Some(judge_id) = &req.judge {
        let cases: HashMap<&str, &Case> = suite.cases.iter().map(|c| (c.id.as_str(), c)).collect();
        for r in results.iter_mut().filter(|r| r.error.is_none()) {
            if engine.cancelled() {
                bail!("benchmark cancelled");
            }
            emit(Progress::Judging { model: r.model.clone(), case_id: r.case_id.clone(), index });
            let case = cases[r.case_id.as_str()];
            let system = persona::system_prompt(&persona, case.corruption, &[]);
            r.judge = judge(engine, judge_id, &system, case, &r.output).ok();
            emit(Progress::CaseFinished { index, result: Box::new(r.clone()) });
            index += 1;
        }
    }

    let infos: HashMap<String, _> = engine.models().into_iter().map(|m| (m.id.clone(), m)).collect();
    let summaries = req.models.iter().map(|m| summarize(m, &results, load_times[m], infos.get(m))).collect();
    let created_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs();
    let report = Report {
        id: created_at.to_string(),
        created_at,
        suite: suite.name,
        params: req.params,
        use_rag: req.use_rag,
        judge: req.judge,
        summaries,
        results,
    };
    save_report(bench_dir, &report)?;
    emit(Progress::Done { report: Box::new(report.clone()) });
    Ok(report)
}

fn summarize(id: &str, results: &[CaseResult], load_ms: f64, info: Option<&crate::models::ModelInfo>) -> ModelSummary {
    let rs: Vec<&CaseResult> = results.iter().filter(|r| r.model == id).collect();
    let ok: Vec<&&CaseResult> = rs.iter().filter(|r| r.error.is_none()).collect();
    let mean = |xs: Vec<f64>| if xs.is_empty() { 0.0 } else { xs.iter().sum::<f64>() / xs.len() as f64 };
    let judged: Vec<&Judgement> = ok.iter().filter_map(|r| r.judge.as_ref()).collect();
    let jmean = |f: fn(&Judgement) -> f64| (!judged.is_empty()).then(|| mean(judged.iter().map(|j| f(j)).collect()));

    let mut by_cat: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for r in &rs {
        by_cat.entry(r.category.clone()).or_default().push(r.rule_score);
    }

    ModelSummary {
        id: id.to_owned(),
        arch: info.map(|i| i.arch.clone()).unwrap_or_default(),
        quant: info.and_then(|i| i.quant.clone()),
        size_bytes: info.map_or(0, |i| i.size_bytes),
        load_ms,
        avg_ttft_ms: mean(ok.iter().map(|r| r.stats.ttft_ms).collect()),
        avg_prompt_tps: mean(ok.iter().map(|r| r.stats.prompt_tps).collect()),
        avg_gen_tps: mean(ok.iter().map(|r| r.stats.gen_tps).collect()),
        avg_gen_tokens: mean(ok.iter().map(|r| r.stats.gen_tokens as f64).collect()),
        rule_score: mean(rs.iter().map(|r| r.rule_score).collect()),
        by_category: by_cat.into_iter().map(|(k, v)| (k, mean(v))).collect(),
        judge_in_character: jmean(|j| j.in_character),
        judge_instructions: jmean(|j| j.instructions),
        judge_quality: jmean(|j| j.quality),
        errors: rs.len() - ok.len(),
    }
}

// ---------- reports ----------

fn results_dir(bench_dir: &Path) -> PathBuf {
    bench_dir.join("results")
}

fn save_report(bench_dir: &Path, report: &Report) -> Result<()> {
    let dir = results_dir(bench_dir);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(format!("{}.json", report.id)), serde_json::to_vec_pretty(report)?)?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct ReportMeta {
    pub id: String,
    pub created_at: u64,
    pub suite: String,
    pub models: Vec<String>,
}

pub fn list_reports(bench_dir: &Path) -> Vec<ReportMeta> {
    let Ok(entries) = std::fs::read_dir(results_dir(bench_dir)) else {
        return vec![];
    };
    let mut out: Vec<ReportMeta> = entries
        .flatten()
        .filter_map(|e| load_report_path(&e.path()).ok())
        .map(|r| ReportMeta {
            id: r.id,
            created_at: r.created_at,
            suite: r.suite,
            models: r.summaries.into_iter().map(|s| s.id).collect(),
        })
        .collect();
    out.sort_by_key(|r| std::cmp::Reverse(r.created_at));
    out
}

pub fn load_report(bench_dir: &Path, id: &str) -> Result<Report> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        bail!("invalid report id");
    }
    load_report_path(&results_dir(bench_dir).join(format!("{id}.json")))
}

fn load_report_path(path: &Path) -> Result<Report> {
    Ok(serde_json::from_slice(&std::fs::read(path)?)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_boundaries() {
        assert!(contains_word("that is cool.", "cool"));
        assert!(!contains_word("the cooling vents", "cool"));
        assert!(contains_word("static ▓▓ noise", "▓"));
        assert!(contains_word("as an ai, i", "as an ai"));
    }

    #[test]
    fn sentences() {
        assert_eq!(count_sentences("[LOG_ENTRY #48]\n> ALL SYSTEMS ARE... NOMINAL. The oxygen whispers."), 2);
        assert_eq!(count_sentences("One two. Three four! Five six?"), 3);
    }

    #[test]
    fn thinking() {
        assert_eq!(strip_thinking("<think>hmm</think> Hello"), "Hello");
    }
}
