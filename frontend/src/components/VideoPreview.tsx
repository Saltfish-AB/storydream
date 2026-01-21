interface VideoPreviewProps {
  previewUrl: string | null;
  isLoading: boolean;
}

export function VideoPreview({ previewUrl, isLoading }: VideoPreviewProps) {
  if (!previewUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-500 text-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p>Starting session...</p>
            </div>
          ) : (
            <p>No preview available</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-zinc-950">
      <iframe
        src={previewUrl}
        className="w-full h-full border-0"
        title="Video Preview"
        allow="autoplay"
      />
    </div>
  );
}
