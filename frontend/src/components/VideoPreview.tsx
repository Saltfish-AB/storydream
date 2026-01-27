interface VideoPreviewProps {
  previewUrl: string | null;
  isLoading: boolean;
}

export function VideoPreview({ previewUrl, isLoading }: VideoPreviewProps) {
  if (!previewUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center" style={{ color: 'var(--text-muted)' }}>
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-warm)' }}></div>
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
    <div className="w-full h-full" style={{ background: 'var(--bg-primary)' }}>
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
