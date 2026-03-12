/* Max's AI - ChatGPT Interface v2 [Build 130127] */
import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('maxai_sessions');
    return saved ? JSON.parse(saved) : [{ id: Date.now(), title: 'New Chat', messages: [] }];
  });

  const [currentSessionId, setCurrentSessionId] = useState(() => {
    const saved = localStorage.getItem('maxai_current');
    const id = saved ? parseInt(saved) : null;
    const s = localStorage.getItem('maxai_sessions');
    const parsed = s ? JSON.parse(s) : [];
    if (id && parsed.find(x => x.id === id)) return id;
    return parsed.length > 0 ? parsed[0].id : Date.now();
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('maxai_dark');
    return saved === 'true';
  });

  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const textareaRef = useRef(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];

  const suggestions = [
    "What can you help me with?",
    "Explain a complex topic simply",
    "Help me write a professional email",
    "What are the latest trends in AI?",
  ];

  // Persist
  useEffect(() => { localStorage.setItem('maxai_sessions', JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem('maxai_current', currentSessionId); }, [currentSessionId]);
  useEffect(() => { localStorage.setItem('maxai_dark', darkMode); }, [darkMode]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth <= 768) setSidebarOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const createNewChat = () => {
    const id = Date.now();
    setSessions(prev => [{ id, title: 'New Chat', messages: [] }, ...prev]);
    setCurrentSessionId(id);
    if (window.innerWidth <= 768) setSidebarOpen(false);
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

  const stopGenerating = () => { abortRef.current?.abort(); setIsLoading(false); };

  const handleSend = async (text) => {
    const msg = text || input;
    if (!msg.trim() || isLoading) return;

    const userMsg = { role: 'user', content: msg, timestamp: getTime() };

    setSessions(prev => prev.map(s => {
      if (s.id !== currentSessionId) return s;
      const title = s.title === 'New Chat' ? msg.slice(0, 32) + (msg.length > 32 ? '…' : '') : s.title;
      return { ...s, title, messages: [...s.messages, userMsg] };
    }));

    setInput('');
    setIsLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = '52px';

    const assistantMsg = { role: 'assistant', content: '', timestamp: getTime() };
    setSessions(prev => prev.map(s =>
      s.id === currentSessionId ? { ...s, messages: [...s.messages, assistantMsg] } : s
    ));

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })) }),
        signal: abortRef.current.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const { content } = JSON.parse(data);
            full += content;
            setSessions(prev => prev.map(s => {
              if (s.id !== currentSessionId) return s;
              const msgs = [...s.messages];
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: full };
              return { ...s, messages: msgs };
            }));
          } catch (_) {}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setSessions(prev => prev.map(s => {
        if (s.id !== currentSessionId) return s;
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: '⚠️ Connection error. Please try again.' };
        return { ...s, messages: msgs };
      }));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const autoResize = (e) => {
    e.target.style.height = '52px';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    setInput(e.target.value);
  };

  const renderContent = (content) => {
    if (!content) return null;
    const parts = content.split('```');
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const lines = part.split('\n');
        const lang = lines[0].trim();
        const code = lines.slice(1).join('\n');
        return (
          <div key={i} className="code-block-wrapper">
            <div className="code-block-header">{lang || 'code'}</div>
            <pre className="code-block-content"><code>{code || lang}</code></pre>
          </div>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className={`app-wrapper ${darkMode ? 'dark' : 'light'}`}>

      {/* Mobile overlay */}
      {sidebarOpen && window.innerWidth <= 768 && (
        <div className="sidebar-overlay visible" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={createNewChat}>
            <span>＋</span> New chat
          </button>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <div className="sessions-list">
          <div className="sessions-label">Recent</div>
          {sessions.map(s => (
            <div
              key={s.id}
              className={`session-item ${s.id === currentSessionId ? 'active' : ''}`}
              onClick={() => { setCurrentSessionId(s.id); if (window.innerWidth <= 768) setSidebarOpen(false); }}
            >
              <span className="session-title">{s.title}</span>
              <button className="session-delete" onClick={(e) => deleteSession(s.id, e)}>🗑</button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="theme-toggle-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? '☀️  Light mode' : '🌙  Dark mode'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        <header className="main-header">
          <div className="header-left">
            <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <span className="header-title">Max's AI</span>
          </div>
          <div className="header-right">
            <span className="model-badge">Llama 4 Scout</span>
          </div>
        </header>

        <div className="messages-container">
          <div className="messages-inner">
            {messages.length === 0 && (
              <div className="welcome-screen">
                <div className="welcome-icon">🤖</div>
                <h1 className="welcome-title">How can I help you today?</h1>
                <div className="suggestions-grid">
                  {suggestions.map((s, i) => (
                    <button key={i} className="suggestion-card" onClick={() => handleSend(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="message-row">
                <div className={`message-avatar ${msg.role === 'user' ? 'user-avatar' : 'ai-avatar'}`}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-body">
                  <div className="message-role">{msg.role === 'user' ? 'You' : "Max's AI"}</div>
                  <div className="message-content">
                    {renderContent(msg.content)}
                    {isLoading && i === messages.length - 1 && msg.role === 'assistant' && msg.content && (
                      <span className="blink-cursor" />
                    )}
                  </div>
                  {isLoading && i === messages.length - 1 && msg.role === 'assistant' && !msg.content && (
                    <div className="typing-dots">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  )}
                  <div className="message-time">{msg.timestamp}</div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="input-wrapper">
          <div className="input-inner">
            {isLoading && (
              <button className="stop-btn" onClick={stopGenerating}>
                <div className="stop-icon" /> Stop generating
              </button>
            )}
            <div className="input-box">
              <textarea
                ref={textareaRef}
                className="input-textarea"
                rows="1"
                value={input}
                onChange={autoResize}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder="Message Max's AI..."
              />
              <button
                className={`send-btn ${input.trim() && !isLoading ? 'active' : 'disabled'}`}
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
              >
                ➤
              </button>
            </div>
            <div className="disclaimer">Max's AI can make mistakes. Check important info.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
