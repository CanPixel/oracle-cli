//! Headless benchmark: `npm run bench -- [--judge <model>] [--case <id>] [--no-rag] [--repeats N] [model ...]`
//! With no models given, every chat model in rag_data/ is benchmarked.

use oracle_lib::bench::{self, BenchRequest, Progress};
use oracle_lib::engine::Engine;
use oracle_lib::models::ModelKind;
use std::io::Write;

fn main() -> anyhow::Result<()> {
    let root = oracle_lib::project_dir();
    let engine = Engine::new(root.join("rag_data"))?;
    let bench_dir = root.join("bench");
    let mut req = BenchRequest::default();
    let mut only_cases: Vec<String> = vec![];

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--judge" => req.judge = args.next(),
            "--case" => only_cases.extend(args.next()),
            "--no-rag" => req.use_rag = false,
            "--repeats" => req.repeats = args.next().and_then(|n| n.parse().ok()).unwrap_or(1),
            "--max-tokens" => req.params.max_tokens = args.next().and_then(|n| n.parse().ok()).unwrap_or(256),
            "--temp" => req.params.temperature = args.next().and_then(|n| n.parse().ok()).unwrap_or(0.7),
            "-h" | "--help" => {
                println!("usage: bench [--judge MODEL] [--case ID]... [--no-rag] [--repeats N] [--max-tokens N] [--temp T] [MODEL ...]");
                return Ok(());
            }
            id => req.models.push(id.to_owned()),
        }
    }
    if !only_cases.is_empty() {
        let mut suite = bench::load_suite(&bench_dir)?;
        suite.cases.retain(|c| only_cases.contains(&c.id));
        req.suite = Some(suite);
    }
    if req.models.is_empty() {
        req.models = engine.models().into_iter().filter(|m| m.kind == ModelKind::Chat).map(|m| m.id).collect();
    }

    let report = bench::run(&engine, &bench_dir, req, &mut |p| match p {
        Progress::Loading { model } => println!("\n== {model}"),
        Progress::CaseStarted { case_id, run, .. } => {
            print!("  {case_id} #{run} ... ");
            let _ = std::io::stdout().flush();
        }
        Progress::CaseFinished { result, .. } if result.judge.is_none() => match &result.error {
            Some(e) => println!("ERROR {e}"),
            None => println!(
                "rules {:.0}%  {:.1} tok/s  ttft {:.0}ms",
                result.rule_score * 100.0,
                result.stats.gen_tps,
                result.stats.ttft_ms
            ),
        },
        Progress::Judging { model, case_id, .. } => println!("  judging {model} / {case_id}"),
        _ => {}
    })?;

    println!("\n{:<32} {:>6} {:>8} {:>9} {:>9} {:>7} {:>6} {:>6} {:>6}", "model", "quant", "load ms", "ttft ms", "gen t/s", "rules", "char", "instr", "qual");
    for s in &report.summaries {
        let j = |v: Option<f64>| v.map_or("-".into(), |v| format!("{v:.1}"));
        println!(
            "{:<32} {:>6} {:>8.0} {:>9.0} {:>9.1} {:>6.0}% {:>6} {:>6} {:>6}",
            s.id,
            s.quant.as_deref().unwrap_or("?"),
            s.load_ms,
            s.avg_ttft_ms,
            s.avg_gen_tps,
            s.rule_score * 100.0,
            j(s.judge_in_character),
            j(s.judge_instructions),
            j(s.judge_quality)
        );
    }
    println!("\nsaved bench/results/{}.json", report.id);
    Ok(())
}
