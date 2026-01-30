import { useState, useEffect, useCallback } from 'react';
import { createRender } from '../api';

interface RenderEvent {
  type: 'render:started' | 'render:progress' | 'render:complete' | 'render:failed';
  renderId?: string;
  projectId?: string;
  progress?: number;
  outputUrl?: string;
  error?: string;
}

interface RenderButtonProps {
  projectId: string;
  subscribeToRenderEvents: (listener: (event: RenderEvent) => void) => () => void;
  onRenderEvent?: (event: RenderEvent) => void;
}

interface RenderState {
  isRendering: boolean;
  renderId?: string;
  progress: number;
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
}

export function RenderButton({ projectId, subscribeToRenderEvents, onRenderEvent }: RenderButtonProps) {
  const [renderState, setRenderState] = useState<RenderState>({
    isRendering: false,
    progress: 0,
    status: 'idle',
  });

  const handleRenderEvent = useCallback((event: RenderEvent) => {
    if (event.type === 'render:started') {
      setRenderState(prev => ({
        ...prev,
        renderId: event.renderId,
        status: 'pending',
      }));
    } else if (event.type === 'render:progress') {
      setRenderState(prev => ({
        ...prev,
        progress: event.progress || 0,
        status: 'running',
      }));
    } else if (event.type === 'render:complete') {
      setRenderState({
        isRendering: false,
        status: 'completed',
        outputUrl: event.outputUrl,
        progress: 100,
      });
    } else if (event.type === 'render:failed') {
      setRenderState({
        isRendering: false,
        status: 'failed',
        error: event.error,
        progress: 0,
      });
    }

    onRenderEvent?.(event);
  }, [onRenderEvent]);

  // Subscribe to WebSocket render events
  useEffect(() => {
    const unsubscribe = subscribeToRenderEvents(handleRenderEvent);
    return unsubscribe;
  }, [subscribeToRenderEvents, handleRenderEvent]);

  const handleRender = async () => {
    setRenderState({
      isRendering: true,
      progress: 0,
      status: 'pending',
    });

    try {
      const job = await createRender(projectId, { format: 'mp4' });
      setRenderState(prev => ({
        ...prev,
        renderId: job.renderId,
      }));
    } catch (error) {
      setRenderState({
        isRendering: false,
        progress: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to start render',
      });
    }
  };

  const handleDismiss = () => {
    setRenderState({
      isRendering: false,
      progress: 0,
      status: 'idle',
    });
  };

  return (
    <div className="flex items-center gap-3">
      {/* Render Button */}
      <button
        onClick={handleRender}
        disabled={renderState.isRendering}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
          ${renderState.isRendering
            ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 shadow-lg hover:shadow-purple-500/25'
          }
        `}
      >
        {renderState.isRendering ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Rendering...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M7 4l10 8-10 8V4z" />
            </svg>
            <span>Render Video</span>
          </>
        )}
      </button>

      {/* Progress Indicator */}
      {renderState.isRendering && (
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
              style={{ width: `${renderState.progress}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400">{renderState.progress}%</span>
        </div>
      )}

      {/* Completed State */}
      {renderState.status === 'completed' && renderState.outputUrl && (
        <div className="flex items-center gap-2">
          <a
            href={renderState.outputUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Error State */}
      {renderState.status === 'failed' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-red-400">{renderState.error || 'Render failed'}</span>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Export the event handler type for use in parent components
export type { RenderEvent };
