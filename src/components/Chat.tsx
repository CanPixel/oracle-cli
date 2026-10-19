import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, chatModels, DEFAULT_PARAMS, type ChatMessage, type GenStats, type Status } from '../api';
import { btn, btnDanger, CorruptionSlider, Panel, ParamsEditor, Toggle } from './Controls';

type Entry =
  | { id: number; kind: 'divider'; text: string }
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'oracle'; text: string; model: string; lore?: string[]; stats?: GenStats; error?: boolean };

let nextId = 0;

const LoadingReadout = () => (
  <div className="space-y-1">
    <div className="text-emerald-300 animate-pulse">[RETRIEVING ▒▒░] ⌁ ≋ ≋</div>
    <div className="h-1 w-full bg-emerald-900/40 overflow-hidden">
      <div className="h-full w-1/3 bg-emerald-500/60 animate-[slide_1.2s_linear_infinite]" />
    </div>
  </div>
);

const StatsLine = ({ s }: { s: GenStats }) => (
  <p className="mt-2 text-[10px] text-slate-500">
    ttft {Math.round(s.ttft_ms)}ms · {s.gen_tps.toFixed(1)} tok/s · {s.gen_tokens} tok · prompt {s.prompt_tokens} tok @{' '}
    {Math.round(s.prompt_tps)} tok/s · {s.stop_reason}
    {s.load_ms != null && ` · loaded in ${Math.round(s.load_ms)}ms`}
  </p>
);

const Bubble = ({ e }: { e: Entry }) => {
  if (e.kind === 'divider') {
    return (
      <div className="my-2 flex items-center gap-3 text-slate-500 text-xs">
        <div className="flex-1 border-t border-slate-700" />
        {e.text}
        <div className="flex-1 border-t border-slate-700" />
      </div>
    );
  }
  if (e.kind === 'user') {
    return (
      <div className="self-end max-w-[75%] px-4 py-2 bg-slate-700 text-slate-100 whitespace-pre-wrap text-sm">
        <p className="text-xs text-slate-400 mb-1">&gt;&gt; TRANSMISSION</p>
        {e.text}
      </div>
    );
  }
  return (
    <div
      className={`self-start max-w-[75%] px-4 py-2 bg-slate-900 border-l-4 whitespace-pre-wrap text-sm ${
        e.error ? 'border-red-500 text-red-300' : 'border-emerald-500 text-emerald-300'
      }`}
    >
      <p className="text-xs text-slate-400 mb-1">:: ORACLE [{e.model}]</p>
      {e.text === '' && !e.stats && !e.error ? <LoadingReadout /> : e.text}
      {e.stats && <StatsLine s={e.stats} />}
      {e.lore && e.lore.length > 0 && (
        <details className="mt-1 text-[11px] text-slate-500">
          <summary className="cursor-pointer">retrieved lore ({e.lore.length})</summary>
          {e.lore.map((d, i) => (
            <pre key={i} className="mt-1 p-2 bg-black/40 whitespace-pre-wrap">
              {d}
            </pre>
          ))}
        </details>
      )}
    </div>
  );
};

export default function Chat({ status, onModelLoaded }: { status: Status | null; onModelLoaded: () => void }) {
  const models = chatModels(status);
  const [model, setModel] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [persona, setPersona] = useState('');
  const [corruption, setCorruption] = useState(0);
  const [useRag, setUseRag] = useState(true);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const endRef = useRef<HTMLDivElement>(null);

  // Pick the loaded (or first) model and the default persona once status arrives.
  useEffect(() => {
    if (!status) return;
    if (!model) setModel(status.loaded ?? chatModels(status)[0]?.id ?? '');
    if (!persona) setPersona(status.default_persona);
  }, [status, model, persona]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const push = (e: Entry) => setEntries(prev => [...prev, e]);
  const patch = (id: number, f: (e: Entry) => Entry) => setEntries(prev => prev.map(e => (e.id === id ? f(e) : e)));

  const switchModel = async (id: string) => {
    setModel(id);
    setBusy(true);
    push({ id: nextId++, kind: 'divider', text: `LOADING ${id}…` });
    try {
      const ms = await api.loadModel(id);
      push({ id: nextId++, kind: 'divider', text: ms == null ? `${id} ALREADY RESIDENT` : `LOADED ${id} in ${Math.round(ms)}ms` });
      onModelLoaded();
    } catch (err) {
      push({ id: nextId++, kind: 'divider', text: `LOAD FAILED: ${err}` });
    } finally {
      setBusy(false);
    }
  };

  const send = async (ev: FormEvent) => {
    ev.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy || !model) return;

    const history = entries.flatMap<ChatMessage>(e =>
      e.kind === 'user' ? [{ role: 'user', content: e.text }] : e.kind === 'oracle' && !e.error ? [{ role: 'assistant', content: e.text }] : [],
    );
    const id = nextId++;
    push({ id: nextId++, kind: 'user', text: prompt });
    push({ id, kind: 'oracle', text: '', model });
    setInput('');
    setBusy(true);

    try {
      const reply = await api.chat({ model, persona, corruption, use_rag: useRag, history, prompt, params }, msg => {
        if (msg.event === 'lore') patch(id, e => ({ ...e, lore: msg.docs }));
        else patch(id, e => ({ ...e, text: e.text + msg.text }));
      });
      patch(id, e => ({ ...e, text: reply.text, stats: reply.stats }));
      if (reply.stats.load_ms != null) onModelLoaded();
    } catch (err) {
      patch(id, e => ({ ...e, text: `[SIGNAL LOST] ${err}`, error: true }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-emerald-900/50 text-xs">
          <span className="text-slate-500">MODEL</span>
          <select
            value={model}
            disabled={busy}
            onChange={e => switchModel(e.target.value)}
            className="bg-slate-900 border border-emerald-700 text-emerald-300 px-2 py-1"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.id} {m.quant ? `· ${m.quant}` : ''}
              </option>
            ))}
          </select>
          <button className={btn} onClick={() => setEntries([])} disabled={busy}>
            CLEAR
          </button>
          <button className={`${btn} ml-auto`} onClick={() => setSettingsOpen(o => !o)}>
            {settingsOpen ? 'HIDE CONFIG' : 'CONFIG'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
          {entries.length === 0 && (
            <div className="text-sm text-slate-500 text-center mt-10">
              [LOG_START] Please cease the deep silence. Oracle awaits your query.
            </div>
          )}
          {entries.map(e => (
            <Bubble key={e.id} e={e} />
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex-none flex gap-2 p-4 border-t border-emerald-500/50">
          <input
            className="flex-1 p-3 bg-gray-900/80 border-2 border-emerald-700/50 text-cyan-200 placeholder-gray-500 text-sm focus:outline-none focus:border-emerald-500"
            value={input}
            placeholder={busy ? ':: Awaiting response…' : '> Enter transmission…'}
            onChange={e => setInput(e.target.value)}
            autoFocus
          />
          {busy ? (
            <button type="button" className={btnDanger} onClick={() => api.cancel()}>
              [ABORT]
            </button>
          ) : (
            <button type="submit" className={btn} disabled={!input.trim() || !model}>
              [TRANSMIT]
            </button>
          )}
        </form>
      </div>

      {settingsOpen && (
        <aside className="w-[360px] flex-none overflow-y-auto border-l border-emerald-800/40 bg-slate-950 p-3 space-y-3">
          <Panel title="Core Directives">
            <textarea
              value={persona}
              rows={14}
              onChange={e => setPersona(e.target.value)}
              className="w-full bg-gray-900 text-green-300 border border-emerald-700/50 p-2 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-500">Applied on the next transmission.</span>
              <button className={btn} disabled={persona === status?.default_persona} onClick={() => setPersona(status?.default_persona ?? '')}>
                RESET
              </button>
            </div>
          </Panel>
          <Panel title="Corruption Level">
            <CorruptionSlider level={corruption} onChange={setCorruption} />
          </Panel>
          <Panel title="Retrieval">
            <Toggle label="Inject ship lore (RAG)" value={useRag} onChange={setUseRag} />
          </Panel>
          <Panel title="Sampling">
            <ParamsEditor params={params} onChange={setParams} />
          </Panel>
        </aside>
      )}
    </div>
  );
}
