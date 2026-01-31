import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';

interface LandingProps {
  onStart: () => void;
  isConnected: boolean;
  isLoading: boolean;
}

export function Landing({ onStart, isConnected, isLoading }: LandingProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6">
          <Sparkles className="w-8 h-8" />
        </div>

        <h1 className="text-5xl font-bold text-foreground mb-4">
          StoryDream
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Create stunning videos with AI. Just describe what you want.
        </p>

        <Button
          onClick={onStart}
          disabled={!isConnected || isLoading}
          size="lg"
          className="text-lg px-8 py-6 h-auto"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Starting...
            </>
          ) : (
            'Start Creating'
          )}
        </Button>

        {!isConnected && (
          <p className="mt-4 text-amber-600 text-sm">
            Connecting to server...
          </p>
        )}

        <div className="mt-12 text-muted-foreground text-sm">
          <p>Powered by Remotion + Claude</p>
        </div>
      </div>
    </div>
  );
}
