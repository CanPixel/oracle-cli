
import React from 'react';

interface SystemPromptEditorProps {
  prompt: string;
  setPrompt: (value: string) => void;
}

const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({ prompt, setPrompt }) => {
  return (
    <div className="flex flex-col h-full bg-black/50 border border-emerald-500/30 p-4">
      <label htmlFor="system-prompt" className="text-emerald-400 text-lg mb-2 uppercase tracking-widest">
        Core Directives
      </label>
      <p className="text-gray-400 text-sm mb-4">
        Modify the Oracle core. Changes will be applied on next transmission.
      </p>
      <textarea
        id="system-prompt"
        value={prompt}
        rows={15}  
        onChange={(e) => setPrompt(e.target.value)}
        className="flex-grow bg-gray-900 text-green-300 border border-emerald-700/50 p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent selection:bg-emerald-500 selection:text-black"
      />
    </div>
  );
};

export default SystemPromptEditor;
