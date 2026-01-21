import { useWebSocket } from './hooks/useWebSocket';
import { Landing } from './components/Landing';
import { Chat } from './components/Chat';
import { VideoPreview } from './components/VideoPreview';

export function App() {
  const {
    isConnected,
    isSessionActive,
    isLoading,
    previewUrl,
    messages,
    startSession,
    sendMessage,
  } = useWebSocket();

  // Show landing page if no active session
  if (!isSessionActive) {
    return (
      <Landing
        onStart={startSession}
        isConnected={isConnected}
        isLoading={isLoading}
      />
    );
  }

  // Show main workspace with chat and preview
  return (
    <div className="h-screen flex">
      {/* Chat Panel - Left */}
      <div className="w-1/2 border-r border-zinc-800">
        <Chat
          messages={messages}
          isLoading={isLoading}
          onSendMessage={sendMessage}
        />
      </div>

      {/* Video Preview - Right */}
      <div className="w-1/2">
        <VideoPreview
          previewUrl={previewUrl}
          isLoading={isLoading && !previewUrl}
        />
      </div>
    </div>
  );
}
