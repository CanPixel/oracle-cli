import React, { useState } from 'react';

interface Message {
    sender: 'user' | 'ai';
    text: string;
}

const App: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        { sender: 'ai', text: 'Ready to corrupt a file.' }
    ]);
    const [loading, setLoading] = useState(false);
    const [selectedModel] = useState<string>('');
    const [activeLlmModel] = useState<string | null>(null);

    // Used for the button's status message (retained for clarity)
    const getCleanModelName = (fullFileName: string | null) => {
        if (!fullFileName) return 'N/A';
        return fullFileName.replace('.gguf', '').replace(/[-_.]/g, ' ').trim();
    };

    const handleCorrupt = async () => {
        if (!selectedModel || !activeLlmModel || selectedModel !== activeLlmModel) {
             setMessages(prev => [...prev, { sender: 'ai', text: `Please wait for model "${getCleanModelName(selectedModel)}" to finish loading before triggering corrupt event.` }]);
             return;
        }
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/generate-corrupt-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: selectedModel })
            });
            const data = await response.json();
            setMessages(prev => [...prev, { sender: 'ai', text: `Corrupt Event: ${data.message}` }]);
        } catch (error) {
            console.error('Failed to generate corrupt file:', error);
            setMessages(prev => [...prev, { sender: 'ai', text: 'Error: Failed to trigger corrupt event. Check backend logs.' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-950 text-gray-200 font-inter min-h-screen flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-3xl shadow-2xl overflow-hidden w-full max-w-2xl h-[90vh] flex flex-col">
                <div className="p-6 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-blue-400">A( )VOID Chat</h1>
                    <div className="flex items-center space-x-4 mb-6">
                        <span className="text-gray-400">Current Model: {getCleanModelName(selectedModel)}</span>
                        <button
                            onClick={handleCorrupt}
                            // The button's disabled status depends on the model status check
                            disabled={loading || !selectedModel || selectedModel !== activeLlmModel}
                            className="bg-red-900 hover:bg-red-800 text-white font-medium py-2 px-4 rounded-xl transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                            title="Trigger a corrupt file generation event"
                        >
                            <i className="fas fa-file-alt mr-2"></i>Corrupt
                        </button>
                    </div>
                    <div className="border border-gray-700 p-4 rounded-lg h-40 overflow-y-auto bg-gray-800">
                        <p className="font-semibold mb-2 text-gray-300">System Log:</p>
                        {messages.map((msg, index) => (
                            <p key={index} className={`text-sm ${msg.sender === 'ai' ? 'text-yellow-300' : 'text-blue-300'}`}>
                                [{msg.sender.toUpperCase()}]: {msg.text}
                            </p>
                        ))}
                    </div>
                    {loading && (
                        <div className="p-4 text-center text-red-400 animate-pulse">
                            <i className="fas fa-spinner fa-spin mr-2"></i>Triggering backend corruption...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
