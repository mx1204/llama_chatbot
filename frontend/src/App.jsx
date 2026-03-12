import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const messagesEndRef = useRef(null);

  const suggestions = [
    "What can you help me with?",
    "Explain a complex topic in simple terms",
    "Help me write a professional email",
    "What are the latest trends in AI?"
  ];

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSend = async (textToSend) => {
    const messageText = textToSend || input;
    if (!messageText.trim() || isLoading) return;

    const userMsg = { 
      role: 'user', 
      content: messageText, 
      timestamp: getTime() 
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const assistantMsg = { 
      role: 'assistant', 
      content: '', 
      timestamp: getTime() 
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg].map(({role, content}) => ({role, content})) }),
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
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = assistantContent;
                return newMessages;
              });
            } catch (e) {
              console.error('Parsing error:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = 'Connection error. Please try again.';
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`app-container ${darkMode ? 'dark' : 'light'}`}>
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-4 sm:px-6 z-50 border-b transition-colors bg-inherit border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🤖</div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-tight">Max's AI</h1>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
              <span className="text-xs text-gray-500 font-medium">Learning and Growing</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setMessages([]); localStorage.removeItem('chat_messages'); }}
            className="p-2 text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-blue-500 transition-colors"
          >
            New Chat
          </button>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {darkMode ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* MESSAGES AREA */}
      <main className="flex-1 overflow-y-auto mt-16 px-4 py-6 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-24">
          
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 message-fade-in">
              <div className="text-6xl mb-2">🤖</div>
              <p className="text-lg text-gray-500 text-center max-w-sm">
                Hey! I'm Max's AI. How can I help you today?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(s)}
                    className="p-4 text-left rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-200 group"
                  >
                    <p className="text-sm font-medium group-hover:text-blue-500">{s}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-fade-in`}>
              <div className={`flex items-start gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xl">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div>
                  <div className={`relative p-4 rounded-2xl shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-blue-500 text-white rounded-tr-none' 
                    : 'bg-gray-100 dark:bg-gray-800 text-inherit rounded-tl-none'
                  }`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  </div>
                  <span className={`text-[10px] mt-1 block text-gray-400 font-medium ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start message-fade-in">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xl">🤖</div>
                <div className="p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 rounded-tl-none">
                  <div className="flex items-center gap-1 h-5">
                    <span className="dot-bounce"></span>
                    <span className="dot-bounce"></span>
                    <span className="dot-bounce"></span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* INPUT AREA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-inherit border-t border-gray-200 dark:border-gray-800 z-40">
        <div className="max-w-3xl mx-auto relative group">
          <textarea
            rows="1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Type your message..."
            className="w-full p-4 pr-14 rounded-2xl border border-gray-200 dark:border-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-inherit outline-none transition-all resize-none shadow-sm disabled:opacity-50"
          />
          <button 
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="absolute right-3 bottom-[12px] p-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:bg-gray-400 transition-all shadow-md active:scale-95"
          >
            <span className="text-sm font-bold tracking-tighter">➤</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
