import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, ImageAttachment } from '../types';

interface UseWebSocketOptions {
  projectId?: string;
  initialMessages?: ChatMessage[];
}

interface RenderEvent {
  type: 'render:started' | 'render:progress' | 'render:complete' | 'render:failed';
  renderId?: string;
  projectId?: string;
  progress?: number;
  outputUrl?: string;
  error?: string;
}

type RenderEventListener = (event: RenderEvent) => void;

interface UseWebSocketReturn {
  isConnected: boolean;
  isSessionActive: boolean;
  isLoading: boolean;
  previewUrl: string | null;
  messages: ChatMessage[];
  startSession: () => void;
  sendMessage: (content: string, attachments?: ImageAttachment[]) => void;
  endSession: () => void;
  subscribeToRenderEvents: (listener: RenderEventListener) => () => void;
}

// Use relative WebSocket URL - nginx proxies /ws to backend
const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || getWebSocketUrl();

// Format error into a clear prompt for the agent
function formatErrorReport(error: { message: string; stack?: string; componentStack?: string }): string {
  let report = `RUNTIME ERROR in the video preview - please fix this automatically:

Error: ${error.message}`;

  if (error.stack) {
    const stackLines = error.stack.split('\n').slice(0, 8).join('\n');
    report += `

Stack trace:
${stackLines}`;
  }

  if (error.componentStack) {
    const componentLines = error.componentStack.split('\n').slice(0, 6).join('\n');
    report += `

Component stack:
${componentLines}`;
  }

  report += `

Please read the MyVideo.tsx file, identify the bug causing this error, and fix it.`;

  return report;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { projectId, initialMessages = [] } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  const wsRef = useRef<WebSocket | null>(null);
  const currentAssistantMessage = useRef<string>('');
  const lastErrorRef = useRef<string>('');
  const errorTimeoutRef = useRef<number | null>(null);
  const projectIdRef = useRef<string | undefined>(projectId);
  const renderEventListenersRef = useRef<Set<RenderEventListener>>(new Set());

  // Update projectId ref when it changes
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Update messages when initialMessages change (project loaded)
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

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

  // Listen for error messages from the preview iframe
  useEffect(() => {
    const handlePreviewError = (event: MessageEvent) => {
      if (event.data?.type !== 'remotion:error') return;

      const { error } = event.data;
      const errorKey = error.message + (error.stack || '');

      // Debounce: don't send the same error multiple times
      if (lastErrorRef.current === errorKey) return;
      lastErrorRef.current = errorKey;

      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        lastErrorRef.current = '';
      }, 5000);

      if (!isSessionActive) {
        console.log('Preview error received but session not active:', error.message);
        return;
      }

      // With streaming input mode, we can send messages even while agent is busy
      // The agent server will queue them automatically
      console.log('Preview error received, sending to agent:', error.message);

      const errorReport = formatErrorReport(error);

      setMessages((prev) => [...prev, { role: 'system', content: `Runtime error detected:\n${error.message}` }]);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        setIsLoading(true);
        currentAssistantMessage.current = '';
        wsRef.current.send(
          JSON.stringify({
            type: 'message:send',
            content: errorReport,
          })
        );
      }
    };

    window.addEventListener('message', handlePreviewError);

    return () => {
      window.removeEventListener('message', handlePreviewError);
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [isSessionActive]);

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
        currentAssistantMessage.current = '';
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

      // Handle render events
      case 'render:started':
      case 'render:progress':
      case 'render:complete':
      case 'render:failed':
        console.log('Render event:', message);
        renderEventListenersRef.current.forEach(listener => {
          try {
            listener(message as RenderEvent);
          } catch (error) {
            console.error('Error in render event listener:', error);
          }
        });
        break;
    }
  }, []);

  const handleAgentMessage = useCallback((agentMessage: any) => {
    const sdkMessage = agentMessage.type === 'agent_message' ? agentMessage.data : agentMessage;

    console.log('Agent message received:', sdkMessage.type, sdkMessage);

    if (sdkMessage.type === 'assistant' && sdkMessage.message?.content) {
      currentAssistantMessage.current = '';

      for (const block of sdkMessage.message.content) {
        if (block.type === 'text') {
          currentAssistantMessage.current += block.text;
        }
      }

      if (currentAssistantMessage.current) {
        setMessages((prev) => [...prev, { role: 'assistant', content: currentAssistantMessage.current }]);
      }
    }
  }, []);

  const startSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsLoading(true);
      // Don't clear messages if we have initial messages (loaded from project)
      if (initialMessages.length === 0) {
        setMessages([]);
      }
      currentAssistantMessage.current = '';

      // Include projectId if available
      const payload: any = { type: 'session:start' };
      if (projectIdRef.current) {
        payload.projectId = projectIdRef.current;
      }

      wsRef.current.send(JSON.stringify(payload));
    }
  }, [initialMessages.length]);

  const sendMessage = useCallback(
    (content: string, attachments?: ImageAttachment[]) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && isSessionActive) {
        setMessages((prev) => [...prev, { role: 'user', content, attachments }]);
        setIsLoading(true);
        currentAssistantMessage.current = '';

        wsRef.current.send(
          JSON.stringify({
            type: 'message:send',
            content,
            attachments,
          })
        );
      }
    },
    [isSessionActive]
  );

  const endSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'session:end' }));
    }
  }, []);

  const subscribeToRenderEvents = useCallback((listener: RenderEventListener) => {
    renderEventListenersRef.current.add(listener);
    return () => {
      renderEventListenersRef.current.delete(listener);
    };
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
    subscribeToRenderEvents,
  };
}
