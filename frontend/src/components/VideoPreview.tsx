import { Loader2, VideoOff } from 'lucide-react';

interface VideoPreviewProps {
  previewUrl: string | null;
  isLoading: boolean;
}

export function VideoPreview({ previewUrl, isLoading }: VideoPreviewProps) {
  if (!previewUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/50">
        <div className="text-center text-muted-foreground">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Starting session...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <VideoOff className="h-12 w-12 opacity-50" />
              <p>No preview available</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-muted/50">
      <iframe
        key={previewUrl}
        src={previewUrl}
        className="w-full h-full border-0"
        title="Video Preview"
        allow="autoplay"
      />
    </div>
  );
}
