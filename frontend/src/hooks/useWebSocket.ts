import { useState, useEffect, useCallback, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isSessionActive: boolean;
  isLoading: boolean;
  previewUrl: string | null;
  messages: Message[];
  startSession: () => void;
  sendMessage: (content: string) => void;
  endSession: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'ws://localhost:8080';

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const currentAssistantMessage = useRef<string>('');

  useEffect(() => {
    const ws = new WebSocket(BACKEND_URL);

    ws.onopen = () => {
      console.log('Connected to backend');
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log('Disconnected from backend');
      setIsConnected(false);
      setIsSessionActive(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'session:ready':
        console.log('Session ready:', message);
        setIsSessionActive(true);
        setIsLoading(false);
        setPreviewUrl(message.previewUrl);
        break;

      case 'agent:message':
        handleAgentMessage(message.data);
        break;

      case 'agent:complete':
        // Finalize the assistant message
        if (currentAssistantMessage.current) {
          setMessages(prev => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: currentAssistantMessage.current }
          ]);
          currentAssistantMessage.current = '';
        }
        setIsLoading(false);
        break;

      case 'session:ended':
        setIsSessionActive(false);
        setPreviewUrl(null);
        break;

      case 'error':
        console.error('Server error:', message.message);
        setIsLoading(false);
        break;
    }
  }, []);

  const handleAgentMessage = useCallback((agentMessage: any) => {
    // The agent wraps SDK messages: { type: 'agent_message', data: sdkMessage }
    const sdkMessage = agentMessage.type === 'agent_message' ? agentMessage.data : agentMessage;

    console.log('Agent message received:', sdkMessage.type, sdkMessage);

    // Extract text content from assistant messages
    if (sdkMessage.type === 'assistant' && sdkMessage.message?.content) {
      for (const block of sdkMessage.message.content) {
        if (block.type === 'text') {
          currentAssistantMessage.current += block.text;

          // Update the message in state for streaming effect
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { role: 'assistant', content: currentAssistantMessage.current }
              ];
            } else {
              return [
                ...prev,
                { role: 'assistant', content: currentAssistantMessage.current }
              ];
            }
          });
        }
      }
    }
  }, []);

  const startSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsLoading(true);
      setMessages([]);
      wsRef.current.send(JSON.stringify({ type: 'session:start' }));
    }
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && isSessionActive) {
      // Add user message
      setMessages(prev => [...prev, { role: 'user', content }]);
      setIsLoading(true);
      currentAssistantMessage.current = '';

      wsRef.current.send(JSON.stringify({
        type: 'message:send',
        content,
      }));
    }
  }, [isSessionActive]);

  const endSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'session:end' }));
    }
  }, []);

  return {
    isConnected,
    isSessionActive,
    isLoading,
    previewUrl,
    messages,
    startSession,
    sendMessage,
    endSession,
  };
}
