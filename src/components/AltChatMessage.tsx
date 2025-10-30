import React, { useState, useEffect } from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  isCorrupted: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isCorrupted }) => {
  const [displayedText, setDisplayedText] = useState('');

  // Effect for typing animation
  useEffect(() => {
    if (message.sender === 'ai') {
      setDisplayedText(''); // Reset on new message
      let i = 0;
      const typingInterval = setInterval(() => {
        if (i < message.text.length) {
          setDisplayedText(prev => prev + message.text.charAt(i));
          i++;
        } else {
          clearInterval(typingInterval);
        }
      }, 20); // Adjust typing speed here
      return () => clearInterval(typingInterval);
    } else {
      setDisplayedText(message.text);
    }
  }, [message]);

  // Effect for Text-to-Speech
  useEffect(() => {
    const speak = () => {
      if (
        isCorrupted &&
        message.sender === 'ai' &&
        displayedText === message.text &&
        message.text.length > 0
      ) {
        window.speechSynthesis.cancel(); // Stop any previous speech
        const utterance = new SpeechSynthesisUtterance(message.text);
        
        // Attempt to find a suitable voice
        const voices = window.speechSynthesis.getVoices();
        const desiredVoices = [
          'Google UK English Male', // Chrome
          'Daniel',                 // macOS
          'Microsoft David - English (United States)', // Windows
          'Zarvox',                 // Some systems
        ];

        utterance.voice = voices.find(v => desiredVoices.includes(v.name)) || 
                          voices.find(v => v.lang.startsWith('en-') && v.name.includes('Male')) ||
                          voices[0]; // Fallback to the first available voice

        utterance.pitch = 0.7; // Lower pitch
        utterance.rate = 0.9;  // Slightly slower
        utterance.volume = 1.0;

        window.speechSynthesis.speak(utterance);
      }
    };

    // The 'voiceschanged' event is fired when the list of voices is ready
    if (window.speechSynthesis.getVoices().length > 0) {
      speak();
    } else {
      window.speechSynthesis.onvoiceschanged = speak;
    }

    return () => {
      // Cleanup: stop speaking if component unmounts or dependencies change
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null; // Remove listener
    };
  }, [displayedText, message, isCorrupted]);

  const isUser = message.sender === 'user';
  const prefix = isUser ? '> ' : 'AstroOracle> ';
  const textColor = isUser ? 'text-cyan-400' : 'text-emerald-400';

  return (
    <div className="mb-4 text-lg whitespace-pre-wrap">
      <span className={textColor}>
        {prefix}
        {displayedText}
        {message.sender === 'ai' && displayedText.length < message.text.length && (
            <span className="inline-block w-2 h-4 bg-emerald-400 animate-ping ml-1" />
        )}
      </span>
    </div>
  );
};

export default ChatMessage;