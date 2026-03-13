import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  
  const [docPanelOpen, setDocPanelOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

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

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/documents`);
      const data = await resp.json();
      if (Array.isArray(data)) {
        setDocuments(data);
      } else {
        console.error('Invalid documents data:', data);
        setDocuments([]);
      }
    } catch (err) { 
      console.error('Error fetching docs:', err); 
      setDocuments([]);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('pdf', file);
    
    setIsLoading(true);
    setUploadStatus('Uploading...');
    setUploadProgress(20);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      setUploadProgress(100);
      const data = await res.json();
      if (data.success) {
        setUploadStatus(`Success! ${data.chunks} chunks indexed.`);
        fetchDocuments();
      } else {
        setUploadStatus('Upload failed.');
      }
    } catch (err) {
      setUploadStatus('Error uploading file.');
    } finally {
      setIsLoading(false);
      setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 3000);
    }
  };

  const deleteDocument = async (fileName) => {
    if (!confirm(`Delete ${fileName}?`)) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/documents/${fileName}`, { method: 'DELETE' });
      fetchDocuments();
    } catch (err) { console.error('Delete error:', err); }
  };

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
            const { content, sources } = JSON.parse(data);
            full += content;
            setSessions(prev => prev.map(s => {
              if (s.id !== currentSessionId) return s;
              const msgs = [...s.messages];
              msgs[msgs.length - 1] = { 
                ...msgs[msgs.length - 1], 
                content: full,
                sources: sources || msgs[msgs.length - 1].sources 
              };
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
            <button className="docs-toggle-btn" onClick={() => setDocPanelOpen(!docPanelOpen)}>
              📚 Documents
            </button>
            <span className="model-badge">Llama 4 Scout</span>
          </div>
        </header>

        <div className="main-content-row">
          <div className="chat-and-input">

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
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 style={{ fontSize: "20px", fontWeight: "bold", margin: "12px 0 8px" }}>{children}</h1>,
                        h2: ({ children }) => <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: "10px 0 6px" }}>{children}</h2>,
                        h3: ({ children }) => <h3 style={{ fontSize: "16px", fontWeight: "bold", margin: "8px 0 4px" }}>{children}</h3>,
                        strong: ({ children }) => <strong style={{ fontWeight: "700" }}>{children}</strong>,
                        em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
                        p: ({ children }) => <p style={{ margin: "6px 0" }}>{children}</p>,
                        ul: ({ children }) => <ul style={{ paddingLeft: "20px", margin: "6px 0" }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ paddingLeft: "20px", margin: "6px 0" }}>{children}</ol>,
                        li: ({ children }) => <li style={{ margin: "3px 0" }}>{children}</li>,
                        code: ({ children, className }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code style={{
                              background: darkMode ? "#3d3d3d" : "#f0f0f0",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "13px",
                              fontFamily: "monospace"
                            }}>
                              {children}
                            </code>
                          ) : (
                            <div className="code-block-wrapper">
                              <div className="code-block-header">{className.replace('language-', '') || 'code'}</div>
                              <pre className="code-block-content">
                                <code>{children}</code>
                              </pre>
                            </div>
                          );
                        },
                        table: ({ children }) => (
                          <div style={{ overflowX: 'auto', margin: '12px 0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>{children}</table>
                          </div>
                        ),
                        th: ({ children }) => <th style={{ border: '1px solid rgba(0,0,0,0.1)', padding: '8px', background: 'rgba(0,0,0,0.05)', textAlign: 'left' }}>{children}</th>,
                        td: ({ children }) => <td style={{ border: '1px solid rgba(0,0,0,0.1)', padding: '8px' }}>{children}</td>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
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
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="message-sources">
                      <div className="sources-label">📄 Sources:</div>
                      <div className="sources-list">
                        {msg.sources.map(src => <span key={src} className="source-tag">{src}</span>)}
                      </div>
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

        {docPanelOpen && (
          <aside className="docs-panel">
            <div className="docs-panel-header">
              <h3>Document Management</h3>
              <button onClick={() => setDocPanelOpen(false)}>✕</button>
            </div>
            
            <div className="upload-section">
              <label className="upload-dropzone">
                <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: 'none' }} />
                <div className="upload-icon">📄</div>
                <p>Drop PDF here or click to upload</p>
              </label>
              
              {uploadProgress > 0 && (
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
              {uploadStatus && <div className="upload-status">{uploadStatus}</div>}
            </div>

            <div className="docs-list">
              <h4>Uploaded Documents</h4>
              {documents.length === 0 ? (
                <p className="empty-docs">No documents yet.</p>
              ) : (
                documents.map(doc => (
                  <div key={doc} className="doc-item">
                    <span title={doc}>{doc}</span>
                    <button onClick={() => deleteDocument(doc)}>🗑️</button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  </div>
  );
}

export default App;
