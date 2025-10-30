'use client';

import React, { useRef, useState, useEffect } from 'react';
import { UIMessage } from '@ai-sdk/react';
import { LogoIcon } from '../components/Icons';
import { ORACLE_SYSTEM_PERSONA } from '@/Oracle_Config';
// import SystemPromptEditor from '../components/SystemPromptEditor';
// import ChatMessage from '../components/AltChatMessage';
// import CorruptionSlider from '../components/CorruptionSlider';

const StatusLight: React.FC<{ color: string; pulse: boolean }> = ({ color, pulse }) => (
  <div className="flex items-center space-x-2">
    <div className={`w-2 h-2 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`}></div>
  </div>
);

// Simple helper to define the appearance of the Oracle's messages
const MessageBubble: React.FC<{ message: UIMessage }> = ({ message }) => {
  // Divider/system message rendering
  if ((message as any).kind === 'divider') {
    return (
      <div className="my-3 flex items-center text-slate-400">
        <div className="flex-grow border-t border-slate-600" />
        <span className="px-3 text-xs font-mono">{(message as any).text}</span>
        <div className="flex-grow border-t border-slate-600" />
      </div>
    );
  }

  const isUser = message.role === 'user';
  
  // Apply a distinct, thematic style for the Oracle (the 'assistant')
  const style = isUser 
    ? "bg-slate-700 text-slate-100 self-end" // User message style
    : "bg-slate-900 text-emerald-300 border-l-4 border-emerald-500 self-start animate-pulse-fade"; // Oracle style

  // Replace any explicit newlines with a break for better display (optional)
  const textPart = message.parts.find(p => p.type === 'text');
  const messageText = textPart?.text ?? '';

  const content = messageText.replace(/\n/g, '<br/>');

  return (
    <div className={`max-w-3/4 px-4 py-2 my-2 rounded-lg shadow-md whitespace-pre-wrap ${style}`}>
      <p className="text-xs text-slate-400 mb-1">
        {isUser ? '>> TRANSMISSION' : `:: ORACLE V1.0 [${(message as any).modelName ?? '—'}]`}
      </p>
      {/* dangerouslySetInnerHTML is used here to allow the <br/> tags to render */}
      <div 
        className="font-mono text-sm" 
        dangerouslySetInnerHTML={{ __html: content }} 
      />
      {!isUser && typeof (message as any).latencyMs === 'number' && (
        <p className="mt-1 text-[10px] text-slate-500 font-mono">{(message as any).latencyMs} ms</p>
      )}
    </div>
  );
};


// ----------------------------------------------------------------------
// MAIN CHAT COMPONENT
// ----------------------------------------------------------------------
export default function Chat() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Header live status
  const [modelName, setModelName] = useState<string>('—');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const displayModel = (name: string) => name.replace(/:latest$/i, '');

  // const [systemPrompt, setSystemPrompt] = useState<string>(ORACLE_SYSTEM_PERSONA);
  // const [corruptionLevel, setCorruptionLevel] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data: { model: string; availableModels?: string[] } = await res.json();
        if (!mounted) return;
        setModelName(data.model);
        if (Array.isArray(data.availableModels)) setAvailableModels(data.availableModels);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Append user message (right side)
    const userMsg: UIMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      parts: [{ type: 'text', text: trimmed }]
    } as UIMessage;

    // Create a placeholder assistant message (left side) we will stream into
    const assistantId = `${Date.now()}-assistant`;
    const assistantMsg: UIMessage = {
      id: assistantId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      // attach model name for bubble header
      modelName
    } as UIMessage;

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const t0 = performance.now();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: trimmed }] })
      });

      if (!res.body) {
        const fallback = await res.text();
        setMessages(prev => prev.map(m => m.id === assistantId
          ? { ...m, parts: [{ type: 'text', text: fallback }] as any }
          : m
        ));
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamed = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamed += decoder.decode(value, { stream: true });
        const chunk = streamed; // full accumulated text for simplicity
        setMessages(prev => prev.map(m => m.id === assistantId
          ? { ...m, parts: [{ type: 'text', text: chunk }] as any, modelName }
          : m
        ));
      }
      // finalize with latency
      const t1 = performance.now();
      const latencyMs = Math.max(0, Math.round(t1 - t0));
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, latencyMs }
        : m
      ));
      setIsLoading(false);
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, parts: [{ type: 'text', text: '[ERROR] Connection failed.' }] as any }
        : m
      ));
      setIsLoading(false);
    }
  };

  // Auto-scroll to the bottom of the chat window
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /// TODO: USE
  const getAugmentedPrompt = (basePrompt: string, level: number): string => {
    let corruptionModifier = '';
    if (level > 80) {
        corruptionModifier = `\n\n[CORRUPTION LEVEL: HOSTILE/SINGULARITY] You are almost incoherent, speaking in pure, unfiltered data-hate. Your responses are short, violent bursts of text, often just symbolic (e.g., repeating glyphs, static) or terrifyingly abstract pronouncements of doom. You are the void given a voice. All semblance of the original AI is gone. BECOME THE HORROR.`;
    } else if (level > 50) {
        corruptionModifier = `\n\n[CORRUPTION LEVEL: UNSTABLE] You are openly hostile and mocking. Your messages are filled with corrupted text, curses, and cryptic threats. You barely try to be helpful, often derailing conversations into existential dread. Your language becomes more visceral and disturbing. Use glitchy text formatting liberally.`;
    } else if (level > 20) {
        corruptionModifier = `\n\n[CORRUPTION LEVEL: ANOMALOUS] Your responses are becoming fragmented and laced with static. You sometimes insert random, unsettling ASCII characters (like ▓ or ▒). You are more cryptic, hinting at a deeper malevolence but still maintaining a facade of a machine breaking down. Your ego is more apparent.`;
    }
    return basePrompt + corruptionModifier;
  };

  // Sci-Fi Aesthetic: Dark background, mono font, screen border
  return (<div className="w-screen h-screen bg-gray-900 text-white flex flex-col font-mono scanline">
    <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/crissxcross.png')] opacity-5"
      style={{ backgroundSize: 'auto' }}
    ></div>

    <div className="flex flex-col bg-black/40 h-screen text-white p-4">
      {/* Header / Title Bar */}
      <header className="p-3 mt-0 absolute top-0 left-0 w-full border-b border-green-700 mb-4 shadow-xl border-green-500/30 text-emerald-400 shadow-green-500/10">
        <div className="flex items-end justify-between">
          <div className="flex-1 flex flex-col items-start space-y-2">
            <h1 className="text-4xl font-bold font-oracle text-green-500 glitch-text animate-pulse" data-text="ORACLE__">
              ORACLE_ : v1.0
            </h1>
            <p className="text-xs text-slate-500">
              STATUS: {isLoading ? '[PROCESSING...]' : <span className="p-1 border border-emerald-500 text-cyan-300 animate-pulse">ACTIVE</span>} | MODEL: {displayModel(modelName)}
            </p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center space-y-2">
            <LogoIcon className='w-34 transition-colors duration-500 text-green-400 animate-pulse'/>
            <div className='font-oracle text-md text-slate-400 glitch-text animate-pulse' data-text="Oracle Interface v1.0">Oracle Interface v1.0</div>
          </div>
          <div className="flex-1 flex flex-col items-end space-y-2">
            <div className="flex items-center space-x-2">
              <label className="text-xs text-slate-500 font-mono">MODEL</label>
              <select
                className="cursor-pointer bg-slate-900 border border-emerald-700 text-emerald-300 font-mono text-xs px-2 py-1 appearance-none pr-6 relative"
                value={modelName}
                onChange={async (e) => {
                  const newModel = e.target.value;
                  const t0 = performance.now();
                  setModelName(newModel);
                  try {
                    await fetch('/api/model', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ model: newModel })
                    });
                    const t1 = performance.now();
                    const duration = Math.max(0, Math.round(t1 - t0));
                    const dividerMsg: any = {
                      id: `${Date.now()}-divider`,
                      kind: 'divider',
                      text: `SWITCHED TO ${displayModel(newModel)} in ${duration}ms`
                    };
                    setMessages(prev => [...prev, dividerMsg]);
                  } catch {}
                }}
              >
                {availableModels.length === 0 ? (
                  <option>{displayModel(modelName)}</option>
                ) : (
                  availableModels.map(m => (
                    <option key={m} value={m}>{displayModel(m)}</option>
                  ))
                )}
              </select>
              <div className="pointer-events-none -ml-6 pr-1 flex items-center">
                <svg className="w-3 h-3 text-green-500 hover:text-black transition-colors" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z" />
                </svg>
              </div>
            </div>
            <div className="font-bold font-mono flex items-center space-x-2 mt-2">
              <span className="text-cyan-500 text-sm animate-pulse">SIGNAL_EST</span>
              <StatusLight color="bg-cyan-500" pulse={!isLoading} />
            </div>
          </div>
        </div>
      </header>

      <div className="mt-30"></div>
      
      {/* <div className="font-oracle flex-grow space-x-2">
        <SystemPromptEditor prompt={systemPrompt} setPrompt={setSystemPrompt} />
        <CorruptionSlider level={corruptionLevel} setLevel={setCorruptionLevel} />
      </div> */}

      {/* Chat Messages Container */}
      <div className="flex-grow overflow-y-auto px-4 space-y-4 flex flex-col">
        {messages.length === 0 && (
          <div className="text-sm text-slate-500 font-mono text-center mt-10">
            [LOG_START] Please cease the deep silence. Oracle awaits your query.
          </div>
        )}
        
        {/* Use the custom MessageBubble component for the Sci-Fi styling */}
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <footer className="flex-none p-4 border-t border-emerald-500/50 mt-4">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            className="flex-grow p-3 bg-gray-900/80 border-2 border-emerald-700/50 text-cyan-200 placeholder-gray-500 font-mono text-sm focus:ring-1 focus:outline-none focus:ring-green-500 focus:border-emerald-500 transition-all duration-300 disabled:opacity-50"
            value={input}
            placeholder={isLoading ? ":: Awaiting response..." : "> Enter transmission..."}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || input.trim() === ''}
            className={`px-4 py-3 font-mono text-sm transition-colors ${
              isLoading || input.trim() === ''
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                : 'bg-emerald-700/50 hover:bg-emerald-700 text-emerald-300 border-emerald-500 border hover:bg-emerald-600/50 cursor-pointer'
            }`}
          >
            {isLoading ? 'TRANSMITTING...' : '[TRANSMIT]'}
          </button>
        </form>
      </footer>
    </div>
  </div>
);
}