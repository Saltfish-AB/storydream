interface LandingProps {
  onStart: () => void;
  isConnected: boolean;
  isLoading: boolean;
}

export function Landing({ onStart, isConnected, isLoading }: LandingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold text-white mb-4">
          StoryDream
        </h1>
        <p className="text-xl text-zinc-400 mb-8">
          Create stunning videos with AI. Just describe what you want.
        </p>

        <button
          onClick={onStart}
          disabled={!isConnected || isLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-lg px-8 py-4 rounded-xl transition-all transform hover:scale-105 disabled:transform-none"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Starting...
            </span>
          ) : (
            'Start Creating'
          )}
        </button>

        {!isConnected && (
          <p className="mt-4 text-yellow-500 text-sm">
            Connecting to server...
          </p>
        )}

        <div className="mt-12 text-zinc-500 text-sm">
          <p>Powered by Remotion + Claude</p>
        </div>
      </div>
    </div>
  );
}
