'use client';

import React, { useRef, useState, useEffect } from 'react';
import { UIMessage } from '@ai-sdk/react';

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
    : "bg-slate-900 text-green-300 border-l-4 border-green-500 self-start animate-pulse-fade"; // Oracle style

  // Replace any explicit newlines with a break for better display (optional)
  const textPart = message.parts.find(p => p.type === 'text');
  const messageText = textPart?.text ?? '';

  const content = messageText.replace(/\n/g, '<br/>');

  return (
    <div className={`max-w-3/4 px-4 py-2 my-2 rounded-lg shadow-md whitespace-pre-wrap ${style}`}>
      <p className="text-xs text-slate-400 mb-1">
        {isUser ? ':: TRANSMISSION' : `:: ORACLE_V1.0 [${(message as any).modelName ?? '—'}]`}
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
  const [ragState, setRagState] = useState<'loading' | 'active'>('loading');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const displayModel = (name: string) => name.replace(/:latest$/i, '');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data: { model: string; rag: 'loading' | 'active'; availableModels?: string[] } = await res.json();
        if (!mounted) return;
        setModelName(data.model);
        setRagState(data.rag);
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

  return (
    // Sci-Fi Aesthetic: Dark background, mono font, screen border
    <div className="flex flex-col h-screen bg-black text-white p-4">
      
      {/* Header / Title Bar */}
      <header className="flex-none p-3 border-b border-green-700 mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold font-mono text-green-500">
            ORACLE :: V1.0
          </h1>
          <div className="flex items-center space-x-2">
            {/* <label className="text-xs text-slate-500 font-mono">MODEL</label> */}
            <select
              className="bg-slate-900 border border-green-700 text-green-300 font-mono text-xs px-2 py-1 appearance-none pr-6 relative"
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
        </div>
        <p className="text-xs text-slate-500">
          STATUS: {isLoading ? '[PROCESSING...]' : '[READY]'} | MODEL: {displayModel(modelName)} | RAG: {ragState.toUpperCase()}
        </p>
      </header>

      {/* Chat Messages Container */}
      <div className="flex-grow overflow-y-auto px-4 space-y-4 flex flex-col"> {/* Added 'flex flex-col' for better alignment */}
        {messages.length === 0 && (
          <div className="text-slate-500 font-mono text-center mt-10">
            [LOG_START] The silence deepens. Speak to the Oracle.
          </div>
        )}
        
        {/* Use the custom MessageBubble component for the Sci-Fi styling */}
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <footer className="flex-none p-4 border-t border-green-700 mt-4">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            className="flex-grow p-3 bg-slate-900 border border-slate-700 text-green-300 font-mono text-sm focus:ring-green-500 focus:border-green-500"
            value={input}
            placeholder={isLoading ? ":: Awaiting response..." : ":: Enter transmission..."}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || input.trim() === ''}
            className={`px-4 py-3 font-mono text-sm transition-colors ${
              isLoading || input.trim() === ''
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-green-700 hover:bg-green-600 text-white'
            }`}
          >
            {isLoading ? '...' : '[TRANSMIT]'}
          </button>
        </form>
      </footer>
    </div>
  );
}