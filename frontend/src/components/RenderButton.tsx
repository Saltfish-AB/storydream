import { useState, useEffect, useCallback } from 'react';
import { createRender } from '../api';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Loader2, Download, X, AlertCircle } from 'lucide-react';

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
      <Button
        onClick={handleRender}
        disabled={renderState.isRendering}
      >
        {renderState.isRendering ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Rendering...</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            <span>Render Video</span>
          </>
        )}
      </Button>

      {/* Progress Indicator */}
      {renderState.isRendering && (
        <div className="flex items-center gap-2">
          <Progress value={renderState.progress} className="w-32 h-2" />
          <span className="text-xs text-muted-foreground">{renderState.progress}%</span>
        </div>
      )}

      {/* Completed State */}
      {renderState.status === 'completed' && renderState.outputUrl && (
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="secondary"
            size="sm"
            className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
          >
            <a
              href={renderState.outputUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Error State */}
      {renderState.status === 'failed' && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span>{renderState.error || 'Render failed'}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Export the event handler type for use in parent components
export type { RenderEvent };
