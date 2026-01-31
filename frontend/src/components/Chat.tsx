import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
}

export function Chat({ messages, isLoading, onSendMessage }: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            Describe the video you want to create...
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user'
                ? 'justify-end'
                : message.role === 'system'
                ? 'justify-center'
                : 'justify-start'
            }`}
          >
            <div
              className={`rounded-xl px-4 py-2 ${
                message.role === 'system'
                  ? 'max-w-[90%] text-amber-200 border border-amber-700/50'
                  : 'max-w-[80%]'
              } ${
                message.role === 'user'
                  ? 'text-white'
                  : 'text-zinc-100'
              }`}
              style={{
                background: message.role === 'user'
                  ? 'var(--accent-warm)'
                  : message.role === 'system'
                  ? 'rgba(120, 80, 20, 0.3)'
                  : 'rgba(40, 35, 32, 0.8)'
              }}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm">
                {message.content}
              </pre>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="rounded-xl px-4 py-2" style={{ background: 'rgba(40, 35, 32, 0.8)', color: 'var(--text-secondary)' }}>
              <div className="flex items-center gap-2">
                <div className="animate-pulse">Thinking...</div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? "Send another message (will be queued)..." : "Describe your video changes..."}
            className="flex-1 text-white rounded-xl px-4 py-2 outline-none transition-all"
            style={{
              background: 'rgba(40, 35, 32, 0.8)',
              border: '1px solid var(--glass-border)',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl transition-colors"
            style={{
              background: !input.trim() ? 'rgba(40, 35, 32, 0.8)' : 'var(--accent-warm)',
            }}
          >
            {isLoading ? 'Queue' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
