import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  // --- STATE ---
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('chat_sessions');
    return saved ? JSON.parse(saved) : [{ id: Date.now(), title: 'New Chat', messages: [] }];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    const savedId = localStorage.getItem('current_session_id');
    return savedId ? parseInt(savedId) : sessions[0].id;
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession.messages;

  const suggestions = [
    "What can you help me with?",
    "Explain a complex topic in simple terms",
    "Help me write a professional email",
    "What are the latest trends in AI?"
  ];

  // --- EFFECTS ---
  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('current_session_id', currentSessionId);
    scrollToBottom();
  }, [currentSessionId]);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // --- ACTIONS ---
  const createNewChat = () => {
    const newId = Date.now();
    const newSession = { id: newId, title: 'New Chat', messages: [] };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth <= 1024) setIsSidebarOpen(false);
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    const filtered = sessions.filter(s => s.id !== id);
    if (filtered.length === 0) {
      const newId = Date.now();
      setSessions([{ id: newId, title: 'New Chat', messages: [] }]);
      setCurrentSessionId(newId);
    } else {
      setSessions(filtered);
      if (currentSessionId === id) setCurrentSessionId(filtered[0].id);
    }
  };

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleSend = async (textToSend) => {
    const messageText = textToSend || input;
    if (!messageText.trim() || isLoading) return;

    const userMsg = { 
      role: 'user', 
      content: messageText, 
      timestamp: getTime() 
    };
    
    // Update session messages and title if first message
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const newMessages = [...s.messages, userMsg];
        const newTitle = s.title === 'New Chat' ? messageText.substring(0, 30) + (messageText.length > 30 ? '...' : '') : s.title;
        return { ...s, messages: newMessages, title: newTitle };
      }
      return s;
    }));

    setInput('');
    setIsLoading(true);

    const assistantMsg = { 
      role: 'assistant', 
      content: '', 
      timestamp: getTime() 
    };
    
    setSessions(prev => prev.map(s => 
      s.id === currentSessionId ? { ...s, messages: [...s.messages, assistantMsg] } : s
    ));

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, userMsg].map(({role, content}) => ({role, content})) 
        }),
        signal: abortControllerRef.current.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const { content } = JSON.parse(data);
              assistantContent += content;
              setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                  const newMsgs = [...s.messages];
                  newMsgs[newMsgs.length - 1].content = assistantContent;
                  return { ...s, messages: newMsgs };
                }
                return s;
              }));
            } catch (e) {
              console.error('Parsing error:', e);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Chat error:', error);
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          const newMsgs = [...s.messages];
          newMsgs[newMsgs.length - 1].content = 'Connection error. Please try again.';
          return { ...s, messages: newMsgs };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Helper to format code snippets simple-style
  const formatContent = (content) => {
    if (!content) return " ";
    const parts = content.split('```');
    return parts.map((part, i) => {
      if (i % 2 === 1) { // Code block
        const lines = part.split('\n');
        const lang = lines[0].trim();
        const code = lines.slice(1).join('\n');
        return (
          <div key={i} className="my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="bg-gray-100 dark:bg-gray-800 px-4 py-1 text-xs font-mono text-gray-500 flex justify-between uppercase">
              <span>{lang || 'code'}</span>
            </div>
            <pre className="p-4 bg-gray-50 dark:bg-gray-900 overflow-x-auto text-xs font-mono">
              <code>{code || lang}</code>
            </pre>
          </div>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className={`flex w-full h-screen ${darkMode ? 'dark bg-[#1a1a2e]' : 'bg-[#f8fafc]'} transition-colors duration-200`}>
      
      {/* SIDEBAR */}
      <aside className={`fixed lg:relative z-50 h-full bg-[#f1f5f9] dark:bg-[#0f172a] border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-full sm:w-[280px] left-0' : 'w-0 -left-full lg:left-0 lg:w-0 overflow-hidden'}`}>
        
        {/* Sidebar Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <button 
            onClick={createNewChat}
            className="flex-1 flex items-center gap-2 p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <span className="text-lg">+</span> New Chat
          </button>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] uppercase font-bold text-gray-400 px-2 py-4 tracking-widest">Recent Chats</div>
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => { setCurrentSessionId(session.id); if (window.innerWidth <= 1024) setIsSidebarOpen(false); }}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${session.id === currentSessionId ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-sm">💬</span>
                <span className="text-sm truncate font-medium">{session.title}</span>
              </div>
              <button 
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 text-xs"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
          <button 
             onClick={() => setDarkMode(!darkMode)}
             className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <span>{darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Header */}
        <header className="sticky top-0 z-40 w-full h-14 border-b border-gray-200 dark:border-gray-800 bg-inherit flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              <span className="text-xl">☰</span>
            </button>
            <h2 className="text-sm font-semibold truncate max-w-[150px] sm:max-w-none">
              {currentSession.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 uppercase tracking-tighter">
              Llama 4
            </span>
            <div className="text-lg">🤖</div>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto w-full">
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
            
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 message-fade-in">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-3xl">🤖</div>
                <h1 className="text-3xl font-bold tracking-tight">How can I help you?</h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s)}
                      className="p-4 text-left rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-200 group bg-white dark:bg-[#2d2d44]/50 shadow-sm"
                    >
                      <p className="text-sm font-medium group-hover:text-blue-500">{s}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-fade-in`}>
                <div className={`flex gap-4 w-full ${msg.role === 'user' ? 'max-w-[80%] flex-row-reverse' : 'max-w-none'}`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-lg shadow-sm ${msg.role === 'user' ? 'bg-blue-600' : 'bg-green-600'}`}>
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className={`p-4 rounded-xl text-[15px] leading-relaxed w-full sm:w-auto ${
                    msg.role === 'user' 
                    ? 'bg-blue-500 text-white shadow-md' 
                    : 'bg-white dark:bg-[#2d2d44] border border-gray-200 dark:border-gray-700 shadow-sm text-gray-800 dark:text-gray-100'
                  }`}>
                    <div className="prose dark:prose-invert max-w-none">
                      {formatContent(msg.content)}
                    </div>
                    {idx === messages.length - 1 && isLoading && msg.role === 'assistant' && (
                      <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse align-middle"></span>
                    )}
                    <div className={`text-[9px] mt-2 opacity-50 uppercase font-bold tracking-wider ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && !messages[messages.length-1].content && (
              <div className="flex justify-start message-fade-in">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-green-600 flex items-center justify-center text-lg shadow-sm">🤖</div>
                  <div className="flex items-center gap-1.5 p-4 bg-white dark:bg-[#2d2d44] border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                    <span className="dot-bounce"></span>
                    <span className="dot-bounce"></span>
                    <span className="dot-bounce"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-40" />
          </div>
        </main>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8 bg-gradient-to-t from-inherit via-inherit to-transparent z-40">
          <div className="max-w-3xl mx-auto relative flex flex-col items-center">
            
            {isLoading && (
              <button 
                onClick={handleStopGenerating}
                className="mb-4 px-4 py-2 bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-gray-800 rounded-lg text-xs font-bold shadow-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all flex items-center gap-2"
              >
                <div className="w-2 h-2 bg-red-500 rounded-sm"></div> Stop Generating
              </button>
            )}

            <div className="w-full relative shadow-xl rounded-2xl overflow-hidden group">
              <textarea
                rows="1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder="Message Max's AI..."
                className="w-full p-4 pr-14 bg-white dark:bg-[#2d2d44] border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-none max-h-48 text-[15px] dark:text-gray-100"
              />
              <button 
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                className="absolute right-3 bottom-3 p-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 transition-all active:scale-95"
              >
                <span className="text-xl">➤</span>
              </button>
            </div>
            <p className="mt-3 text-[10px] text-gray-400 font-medium tracking-wide">
              Max's AI can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
