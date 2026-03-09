/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Send, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Loader2, 
  User, 
  Bot, 
  Volume2, 
  VolumeX,
  Sparkles,
  MoreVertical,
  Plus,
  Trash2,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { 
  generateChatResponse, 
  generateImage, 
  generateVideo, 
  textToSpeech, 
  Message 
} from './services/geminiService';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('aura_chat_history');
    return saved ? JSON.parse(saved) : [
      { role: 'model', content: 'Hello! I am Aura, your AI assistant. How can I help you today?', type: 'text' }
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [showMenu, setShowMenu] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('aura_chat_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    checkApiKey();
    setupSpeechRecognition();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkApiKey = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    } else {
      setHasApiKey(true); // Fallback for environments without aistudio global
    }
  };

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const clearHistory = () => {
    const initialMessage: Message = { role: 'model', content: 'Hello! I am Aura, your AI assistant. How can I help you today?', type: 'text' };
    setMessages([initialMessage]);
    localStorage.removeItem('aura_chat_history');
  };

  const setupSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSend(transcript);
      };

      recognitionRef.current = recognition;
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text, type: 'text' };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Check for commands
      const lowerText = text.toLowerCase();
      if (lowerText.includes('create an image') || lowerText.includes('generate an image') || lowerText.includes('make an image')) {
        const prompt = text.replace(/create an image of|generate an image of|make an image of/gi, '').trim();
        await handleImageGeneration(prompt || "a beautiful landscape");
      } else if (lowerText.includes('create a video') || lowerText.includes('generate a video') || lowerText.includes('make a video')) {
        if (!hasApiKey) {
          await handleOpenKeyDialog();
        }
        const prompt = text.replace(/create a video of|generate a video of|make a video of/gi, '').trim();
        await handleVideoGeneration(prompt || "a cinematic sunset");
      } else {
        const responseText = await generateChatResponse(messages, text);
        const modelMessage: Message = { role: 'model', content: responseText || "I'm sorry, I couldn't process that.", type: 'text' };
        setMessages(prev => [...prev, modelMessage]);
        
        if (isSpeaking && responseText) {
          const audio = await textToSpeech(responseText, selectedVoice);
          audio?.play();
        }
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', content: 'Sorry, I encountered an error. Please try again.', type: 'text' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (type: 'image' | 'video') => {
    if (!input.trim()) {
      setInput(type === 'image' ? "Create an image of a beautiful sunset" : "Create a video of a peaceful forest");
      return;
    }
    
    const prefix = type === 'image' ? "Create an image of " : "Create a video of ";
    handleSend(prefix + input);
  };

  const handleReplay = async (content: string) => {
    const audio = await textToSpeech(content, selectedVoice);
    audio?.play();
  };

  const handleImageGeneration = async (prompt: string) => {
    const startMsg = `Sure, I'm generating an image of "${prompt}" for you...`;
    setMessages(prev => [...prev, { role: 'model', content: startMsg, type: 'text' }]);
    if (isSpeaking) {
      const audio = await textToSpeech(startMsg, selectedVoice);
      audio?.play();
    }
    
    try {
      const imageUrl = await generateImage(prompt);
      setMessages(prev => [...prev, { role: 'model', content: prompt, type: 'image', url: imageUrl }]);
      if (isSpeaking) {
        const audio = await textToSpeech("Your image is ready.", selectedVoice);
        audio?.play();
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: 'Failed to generate image.', type: 'text' }]);
    }
  };

  const handleVideoGeneration = async (prompt: string) => {
    const startMsg = `I'm on it! Generating a video of "${prompt}". This might take a minute...`;
    setMessages(prev => [...prev, { role: 'model', content: startMsg, type: 'text' }]);
    if (isSpeaking) {
      const audio = await textToSpeech(startMsg, selectedVoice);
      audio?.play();
    }

    try {
      const videoUrl = await generateVideo(prompt);
      setMessages(prev => [...prev, { role: 'model', content: prompt, type: 'video', url: videoUrl }]);
      if (isSpeaking) {
        // Voiceover: Describe the generated video
        const voiceoverText = `Here is your video of ${prompt}. I've captured the cinematic motion and atmosphere you requested.`;
        const audio = await textToSpeech(voiceoverText, selectedVoice);
        audio?.play();
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: 'Failed to generate video.', type: 'text' }]);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 md:p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Aura</h1>
            <p className="text-xs text-white/50 font-medium uppercase tracking-widest">AI Assistant</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 relative" ref={menuRef}>
          <button 
            onClick={() => setIsSpeaking(!isSpeaking)}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
            title={isSpeaking ? "Mute Voice" : "Unmute Voice"}
          >
            {isSpeaking ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-white/40" />}
          </button>
          
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
            title="Menu"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute right-0 top-full mt-2 w-56 glass-panel shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-2 space-y-1">
                  <button 
                    onClick={() => { clearHistory(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Chat
                  </button>
                  
                  <div className="h-px bg-white/5 my-1" />
                  
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Voice Settings</p>
                    <div className="grid grid-cols-1 gap-1">
                      {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map((voice) => (
                        <button
                          key={voice}
                          onClick={() => { setSelectedVoice(voice); setShowMenu(false); }}
                          className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                            selectedVoice === voice ? 'bg-primary/20 text-primary' : 'text-white/50 hover:bg-white/5'
                          }`}
                        >
                          {voice} {voice === 'Puck' && '(Cute)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-white/5 my-1" />

                  <button 
                    onClick={() => { clearHistory(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear History
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!hasApiKey && (
            <button 
              onClick={handleOpenKeyDialog}
              className="text-xs bg-accent/20 text-accent px-3 py-1 rounded-full border border-accent/30 hover:bg-accent/30 transition-all"
            >
              Setup Video API
            </button>
          )}
        </div>
      </header>

      {/* Chat Window */}
      <main className="flex-1 overflow-y-auto mb-6 pr-2 custom-scrollbar">
        <div className="flex flex-col gap-6">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-zinc-800 text-zinc-400' : 'bg-primary/10 text-primary'
                  }`}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  
                  <div className={`glass-panel p-4 relative group ${
                    msg.role === 'user' ? 'bg-zinc-800/30 border-zinc-700' : 'bg-zinc-900/80'
                  }`}>
                    {msg.type === 'text' && (
                      <div className="markdown-body">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )}
                    
                    {msg.type === 'image' && (
                      <div className="space-y-2">
                        <img 
                          src={msg.url} 
                          alt={msg.content} 
                          className="rounded-lg w-full max-w-sm shadow-2xl"
                          referrerPolicy="no-referrer"
                        />
                        <p className="text-xs text-white/40 italic">{msg.content}</p>
                      </div>
                    )}
                    
                    {msg.type === 'video' && (
                      <div className="space-y-2">
                        <video 
                          src={msg.url} 
                          controls 
                          className="rounded-lg w-full max-w-sm shadow-2xl"
                        />
                        <p className="text-xs text-white/40 italic">{msg.content}</p>
                      </div>
                    )}

                    {msg.role === 'model' && msg.type === 'text' && (
                      <div className="mt-2 pt-2 border-t border-white/5 flex justify-end">
                        <button 
                          onClick={() => handleReplay(msg.content)}
                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
                          title="Speak reply"
                        >
                          <Volume2 className="w-3 h-3" />
                          Speak
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="flex gap-3 items-center text-white/40 text-sm ml-11">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Aura is thinking...</span>
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="glass-panel p-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleListening}
            className={`p-3 rounded-xl transition-all ${
              isListening 
                ? 'bg-red-500 text-white animate-pulse' 
                : 'bg-white/5 hover:bg-white/10 text-white/70'
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask Aura anything..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 px-2 placeholder:text-white/20"
          />
          
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="p-3 rounded-xl bg-primary text-white glow-button disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-2 px-1 pb-1">
          <button 
            onClick={() => handleQuickAction('image')}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/5"
          >
            <ImageIcon className="w-3 h-3" />
            Gen Image
          </button>
          <button 
            onClick={() => handleQuickAction('video')}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/5"
          >
            <VideoIcon className="w-3 h-3" />
            Gen Video
          </button>
        </div>
      </footer>
    </div>
  );
}
