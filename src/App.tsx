import { useCallback, useEffect, useState } from 'react';
import { api, chatModels, type Status } from './api';
import Chat from './components/Chat';
import Bench from './components/Bench';

type Tab = 'chat' | 'bench';

const Logo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 40" fill="none" className={className} aria-hidden>
    <path d="M0 20H40M80 20H120" stroke="currentColor" strokeWidth="4" />
    <circle cx="60" cy="20" r="18" stroke="currentColor" strokeWidth="4" />
  </svg>
);

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const models = chatModels(status);

  return (
    <div className="h-full flex flex-col">
      <header className="flex-none flex items-center gap-6 px-5 py-3 border-b border-emerald-500/30 shadow-xl shadow-green-500/10">
        <div className="flex items-center gap-3">
          <Logo className="w-16 text-green-400 animate-pulse" />
          <h1 className="text-4xl font-oracle text-green-500 glitch-text" data-text="ORACLE_">
            ORACLE_
          </h1>
        </div>

        <nav className="flex gap-1 font-oracle text-xl">
          {(['chat', 'bench'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 border cursor-pointer ${
                tab === t
                  ? 'border-emerald-500 text-emerald-300 bg-emerald-900/30'
                  : 'border-transparent text-slate-500 hover:text-emerald-400'
              }`}
            >
              [{t.toUpperCase()}]
            </button>
          ))}
        </nav>

        <div className="ml-auto text-[11px] text-slate-500 text-right leading-5">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : (
            <>
              <div>
                {models.length} CHAT MODELS · LOADED:{' '}
                <span className="text-cyan-300">{status?.loaded ?? '—'}</span>
              </div>
              <div>
                RAG:{' '}
                <span className={status?.rag.embed_model ? 'text-cyan-300' : 'text-red-400'}>
                  {status?.rag.embed_model ?? 'NO EMBEDDING MODEL'}
                </span>
                {status?.rag.ready && ` · ${status.rag.docs} docs`}
              </div>
            </>
          )}
        </div>
        <button
          onClick={refresh}
          title={`Rescan ${status?.data_dir ?? 'rag_data'}`}
          className="text-xs px-2 py-1 border border-emerald-700/60 text-emerald-300 hover:border-emerald-500 cursor-pointer"
        >
          RESCAN
        </button>
      </header>

      {status && models.length === 0 && (
        <div className="m-6 p-4 border border-red-500/50 text-red-300 text-sm">
          No chat models found in <code>{status.data_dir}</code>. Symlink some <code>.gguf</code> files there and
          press RESCAN.
        </div>
      )}

      {/* Both tabs stay mounted so the conversation and bench results survive switching. */}
      <main className="flex-1 min-h-0">
        <div className={tab === 'chat' ? 'h-full' : 'hidden'}>
          <Chat status={status} onModelLoaded={refresh} />
        </div>
        <div className={tab === 'bench' ? 'h-full' : 'hidden'}>
          <Bench status={status} onFinished={refresh} />
        </div>
      </main>
    </div>
  );
}
