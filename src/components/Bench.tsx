import { useEffect, useMemo, useState } from 'react';
import {
  api,
  chatModels,
  DEFAULT_PARAMS,
  fmtBytes,
  type CaseResult,
  type ModelSummary,
  type Report,
  type ReportMeta,
  type Status,
  type Suite,
} from '../api';
import { btn, btnDanger, Panel, ParamsEditor, Toggle } from './Controls';

interface Live {
  done: number;
  total: number;
  label: string;
  stream: string;
  results: CaseResult[];
}

type Column = {
  label: string;
  get: (s: ModelSummary) => number | null;
  fmt: (v: number) => string;
  /** Which direction wins when highlighting the best model. */
  better: 'high' | 'low';
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const one = (v: number) => v.toFixed(1);
const msFmt = (v: number) => `${Math.round(v)}`;

function columns(report: Report): Column[] {
  const cats = [...new Set(report.summaries.flatMap(s => Object.keys(s.by_category)))].sort();
  const cols: Column[] = [
    { label: 'size', get: s => s.size_bytes, fmt: fmtBytes, better: 'low' },
    { label: 'load ms', get: s => s.load_ms, fmt: msFmt, better: 'low' },
    { label: 'ttft ms', get: s => s.avg_ttft_ms, fmt: msFmt, better: 'low' },
    { label: 'prompt t/s', get: s => s.avg_prompt_tps, fmt: msFmt, better: 'high' },
    { label: 'gen t/s', get: s => s.avg_gen_tps, fmt: one, better: 'high' },
    { label: 'avg tok', get: s => s.avg_gen_tokens, fmt: msFmt, better: 'low' },
    { label: 'rules', get: s => s.rule_score, fmt: pct, better: 'high' },
    ...cats.map(c => ({ label: c.replace('_', ' '), get: (s: ModelSummary) => s.by_category[c] ?? null, fmt: pct, better: 'high' as const })),
  ];
  if (report.judge) {
    cols.push(
      { label: 'in-char', get: s => s.judge_in_character, fmt: one, better: 'high' },
      { label: 'instr', get: s => s.judge_instructions, fmt: one, better: 'high' },
      { label: 'quality', get: s => s.judge_quality, fmt: one, better: 'high' },
    );
  }
  return cols;
}

const SummaryTable = ({ report }: { report: Report }) => {
  const cols = columns(report);
  const best = cols.map(c => {
    const vals = report.summaries.map(c.get).filter((v): v is number => v != null);
    return vals.length > 1 ? (c.better === 'high' ? Math.max(...vals) : Math.min(...vals)) : null;
  });
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr className="text-slate-400 text-left">
            <th className="p-2">model</th>
            <th className="p-2">quant</th>
            {cols.map(c => (
              <th key={c.label} className="p-2 text-right whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.summaries.map(s => (
            <tr key={s.id} className="border-t border-emerald-900/40">
              <td className="p-2 text-emerald-300 whitespace-nowrap">
                {s.id}
                {s.errors > 0 && <span className="ml-2 text-red-400">{s.errors} err</span>}
              </td>
              <td className="p-2 text-slate-400">{s.quant ?? '?'}</td>
              {cols.map((c, i) => {
                const v = c.get(s);
                return (
                  <td key={c.label} className={`p-2 text-right tabular-nums ${v != null && v === best[i] ? 'text-cyan-300 font-bold' : 'text-slate-300'}`}>
                    {v == null ? '–' : c.fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ResultCell = ({ r }: { r: CaseResult }) => (
  <div className="space-y-1.5">
    {r.error ? (
      <div className="text-red-400">{r.error}</div>
    ) : (
      <div className="whitespace-pre-wrap text-emerald-200 max-h-56 overflow-y-auto">{r.output || <em className="text-slate-600">(empty)</em>}</div>
    )}
    <div className="flex flex-wrap gap-1">
      {r.checks.map((c, i) => (
        <span
          key={i}
          title={c.detail}
          className={`px-1 border text-[10px] ${c.pass ? 'border-emerald-800 text-emerald-500' : 'border-red-800 text-red-400'}`}
        >
          {c.pass ? '✓' : '✗'} {c.name}
        </span>
      ))}
    </div>
    {r.judge && (
      <div className="text-[10px] text-cyan-300" title={r.judge.note}>
        judge: char {r.judge.in_character} · instr {r.judge.instructions} · qual {r.judge.quality} — <span className="text-slate-400">{r.judge.note}</span>
      </div>
    )}
    <div className="text-[10px] text-slate-500">
      {r.stats.gen_tps.toFixed(1)} tok/s · {r.stats.gen_tokens} tok · ttft {Math.round(r.stats.ttft_ms)}ms · {r.stats.stop_reason}
    </div>
  </div>
);

const CaseGrid = ({ models, results }: { models: string[]; results: CaseResult[] }) => {
  const [category, setCategory] = useState('all');
  const categories = [...new Set(results.map(r => r.category))];
  const cases = [...new Map(results.filter(r => category === 'all' || r.category === category).map(r => [r.case_id, r])).values()];
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs">
        {['all', ...categories].map(c => (
          <button key={c} onClick={() => setCategory(c)} className={`px-2 border cursor-pointer ${category === c ? 'border-emerald-500 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full table-fixed min-w-[900px]">
          <thead>
            <tr className="text-slate-400 text-left">
              <th className="p-2 w-48">case</th>
              {models.map(m => (
                <th key={m} className="p-2">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.case_id} className="border-t border-emerald-900/40 align-top">
                <td className="p-2">
                  <div className="text-emerald-400">{c.case_id}</div>
                  <div className="text-slate-500 text-[10px]">{c.category}</div>
                  <div className="text-slate-300 mt-1">{c.prompt}</div>
                </td>
                {models.map(m => (
                  <td key={m} className="p-2 space-y-3">
                    {results
                      .filter(r => r.model === m && r.case_id === c.case_id)
                      .map(r => (
                        <ResultCell key={r.run} r={r} />
                      ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function Bench({ status, onFinished }: { status: Status | null; onFinished: () => void }) {
  const models = chatModels(status);
  const [selected, setSelected] = useState<string[]>([]);
  const [judge, setJudge] = useState('');
  const [useRag, setUseRag] = useState(true);
  const [repeats, setRepeats] = useState(1);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [suite, setSuite] = useState<Suite | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<ReportMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSuite().then(setSuite, e => setError(String(e)));
    api.listReports().then(setHistory, () => {});
  }, []);

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const run = async () => {
    setError(null);
    setReport(null);
    setLive({ done: 0, total: 0, label: 'starting…', stream: '', results: [] });
    try {
      const r = await api.runBench({ models: selected, judge: judge || null, use_rag: useRag, repeats, params }, p => {
        setLive(l => {
          if (!l) return l;
          switch (p.event) {
            case 'started':
              return { ...l, total: p.total };
            case 'loading':
              return { ...l, label: `loading ${p.model}…`, stream: '' };
            case 'case_started':
              return { ...l, label: `${p.model} / ${p.case_id}${repeats > 1 ? ` #${p.run}` : ''}`, stream: '' };
            case 'token':
              return { ...l, stream: l.stream + p.text };
            case 'judging':
              return { ...l, label: `judging ${p.model} / ${p.case_id}`, stream: '' };
            case 'case_finished': {
              const rest = l.results.filter(r => !(r.model === p.result.model && r.case_id === p.result.case_id && r.run === p.result.run));
              return { ...l, done: p.index + 1, results: [...rest, p.result] };
            }
            default:
              return l;
          }
        });
      });
      setReport(r);
      setHistory(await api.listReports());
    } catch (e) {
      setError(String(e));
    } finally {
      setLive(null);
      onFinished();
    }
  };

  const shown = report;
  const liveModels = useMemo(() => [...new Set(live?.results.map(r => r.model) ?? [])], [live?.results]);

  return (
    <div className="h-full flex">
      <aside className="w-[320px] flex-none overflow-y-auto border-r border-emerald-800/40 bg-slate-950 p-3 space-y-3">
        <Panel title="Models">
          {models.map(m => (
            <label key={m.id} className="flex items-start gap-2 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-emerald-500" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
              <span>
                <span className="text-emerald-300">{m.id}</span>
                <span className="block text-[10px] text-slate-500">
                  {m.arch} · {m.size_label ?? '?'} · {m.quant ?? '?'} · {fmtBytes(m.size_bytes)}
                </span>
              </span>
            </label>
          ))}
          <div className="flex gap-2">
            <button className={btn} onClick={() => setSelected(models.map(m => m.id))}>
              ALL
            </button>
            <button className={btn} onClick={() => setSelected([])}>
              NONE
            </button>
          </div>
        </Panel>
        <Panel title="Scoring">
          <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
            LLM judge
            <select value={judge} onChange={e => setJudge(e.target.value)} className="bg-slate-900 border border-emerald-800 text-emerald-200 px-1 py-0.5 max-w-[170px]">
              <option value="">none (rules only)</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[10px] text-slate-500">Use your strongest model as judge; small models score leniently.</p>
          <Toggle label="Inject ship lore (RAG)" value={useRag} onChange={setUseRag} />
          <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
            runs per case
            <input type="number" min={1} max={10} value={repeats} onChange={e => setRepeats(Math.max(1, Number(e.target.value)))} className="w-24 bg-slate-900 border border-emerald-800 text-emerald-200 px-2 py-0.5 text-right" />
          </label>
        </Panel>
        <Panel title="Sampling">
          <ParamsEditor params={params} onChange={setParams} />
        </Panel>
        <div className="text-[11px] text-slate-500">
          Suite <span className="text-emerald-400">{suite?.name ?? '…'}</span>: {suite?.cases.length ?? 0} cases from bench/suite.json
        </div>
        {live ? (
          <button className={`${btnDanger} w-full`} onClick={() => api.cancel()}>
            [ABORT RUN]
          </button>
        ) : (
          <button className={`${btn} w-full py-2`} disabled={selected.length === 0 || !suite} onClick={run}>
            [RUN BENCHMARK]
          </button>
        )}
        <Panel title="Past runs">
          {history.length === 0 && <p className="text-xs text-slate-500">none yet</p>}
          {history.map(h => (
            <button
              key={h.id}
              onClick={() => api.loadReport(h.id).then(setReport, e => setError(String(e)))}
              className={`block w-full text-left text-[11px] cursor-pointer hover:text-emerald-300 ${report?.id === h.id ? 'text-emerald-300' : 'text-slate-400'}`}
            >
              {new Date(h.created_at * 1000).toLocaleString()} · {h.models.length} model{h.models.length === 1 ? '' : 's'}
              <span className="block text-[10px] text-slate-600 truncate">{h.models.join(', ')}</span>
            </button>
          ))}
        </Panel>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
        {error && <div className="p-3 border border-red-600/60 text-red-300 text-sm">{error}</div>}

        {live && (
          <Panel title="Running">
            <div className="text-xs text-slate-300">
              {live.label} <span className="text-slate-500">({live.done}/{live.total || '?'})</span>
            </div>
            <div className="h-1 bg-emerald-900/40">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${live.total ? (100 * live.done) / live.total : 0}%` }} />
            </div>
            <pre className="text-xs text-emerald-200 whitespace-pre-wrap min-h-16 max-h-48 overflow-y-auto bg-black/40 p-2">{live.stream || '…'}</pre>
            {live.results.length > 0 && <CaseGrid models={liveModels} results={live.results} />}
          </Panel>
        )}

        {shown && (
          <>
            <Panel title={`Results · ${shown.suite}`}>
              <p className="text-[11px] text-slate-500">
                {new Date(shown.created_at * 1000).toLocaleString()} · temp {shown.params.temperature} · max {shown.params.max_tokens} tok · RAG{' '}
                {shown.use_rag ? 'on' : 'off'} · judge {shown.judge ?? 'none'}. Best value per column in cyan.
              </p>
              <SummaryTable report={shown} />
            </Panel>
            <Panel title="Side by side">
              <CaseGrid models={shown.summaries.map(s => s.id)} results={shown.results} />
            </Panel>
          </>
        )}

        {!live && !shown && !error && (
          <div className="text-sm text-slate-500 text-center mt-16">
            Select models and run the suite to compare speed, rule compliance and (optionally) judged character quality.
          </div>
        )}
      </div>
    </div>
  );
}
