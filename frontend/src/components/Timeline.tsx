import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';

export interface SequenceInfo {
  id: string;
  name: string;
  from: number;
  durationInFrames: number;
  type: 'scene' | 'audio' | 'text' | 'effect';
}

interface TimelineProps {
  durationInFrames: number;
  fps: number;
  sequences: SequenceInfo[];
  currentFrame?: number;
  onSeek?: (frame: number) => void;
}

const TRACK_COLORS: Record<string, string> = {
  scene: 'hsl(15 100% 60%)',    // Primary orange
  audio: 'hsl(120 25% 50%)',    // Sage green
  text: 'hsl(255 40% 60%)',     // Lavender
  effect: 'hsl(45 50% 55%)',    // Gold
};

const TRACK_ORDER: SequenceInfo['type'][] = ['scene', 'audio', 'text', 'effect'];

export function Timeline({
  durationInFrames,
  fps,
  sequences,
  currentFrame = 0,
  onSeek,
}: TimelineProps) {
  const [playheadFrame, setPlayheadFrame] = useState(currentFrame);

  // Group sequences by type into tracks
  const tracks = useMemo(() => {
    const grouped = new Map<SequenceInfo['type'], SequenceInfo[]>();

    // Initialize all track types
    TRACK_ORDER.forEach((type) => grouped.set(type, []));

    // Group sequences
    sequences.forEach((seq) => {
      const list = grouped.get(seq.type) || [];
      list.push(seq);
      grouped.set(seq.type, list);
    });

    // Filter out empty tracks and convert to array
    return TRACK_ORDER
      .filter((type) => (grouped.get(type) || []).length > 0)
      .map((type) => ({
        type,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        items: grouped.get(type) || [],
      }));
  }, [sequences]);

  // Generate time markers (every second)
  const durationSeconds = durationInFrames / fps;
  const timeMarkers = useMemo(() => {
    const markers = [];
    const interval = durationSeconds <= 10 ? 1 : durationSeconds <= 30 ? 2 : 5;
    for (let i = 0; i <= durationSeconds; i += interval) {
      markers.push(i);
    }
    return markers;
  }, [durationSeconds]);

  // Convert frame to percentage
  const frameToPercent = (frame: number) => (frame / durationInFrames) * 100;

  // Convert seconds to percentage
  const secondsToPercent = (seconds: number) => (seconds / durationSeconds) * 100;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const frame = Math.max(0, Math.min(durationInFrames, Math.round(percent * durationInFrames)));
    setPlayheadFrame(frame);
    onSeek?.(frame);
  };

  useEffect(() => {
    setPlayheadFrame(currentFrame);
  }, [currentFrame]);

  const hasSequences = sequences.length > 0;

  return (
    <Card className="w-full flex-shrink-0 overflow-hidden">
      <div className="flex h-full">
        {/* Track labels column */}
        <div className="w-[80px] flex-shrink-0 border-r">
          <div className="h-7 flex items-center px-3 text-xs text-muted-foreground border-b bg-muted/50">
            Tracks
          </div>
          {hasSequences ? (
            tracks.map((track) => (
              <div
                key={track.type}
                className="h-10 flex items-center px-3 text-xs text-muted-foreground border-b"
              >
                {track.name}
              </div>
            ))
          ) : (
            <div className="h-10 flex items-center px-3 text-xs text-muted-foreground border-b">
              No tracks
            </div>
          )}
        </div>

        {/* Timeline content */}
        <div className="flex-1 min-w-0">
          {/* Time ruler */}
          <div
            className="h-7 relative border-b bg-muted/50 cursor-pointer"
            onClick={handleTimelineClick}
          >
            {timeMarkers.map((seconds) => (
              <div
                key={seconds}
                className="absolute top-0 h-full flex flex-col justify-end pb-1"
                style={{ left: `${secondsToPercent(seconds)}%` }}
              >
                <div className="text-[10px] px-1 text-muted-foreground">
                  {seconds}s
                </div>
                <div className="w-px h-2 bg-border" />
              </div>
            ))}

            {/* Playhead on ruler */}
            <div
              className="absolute top-0 h-full w-0.5 z-10 bg-primary"
              style={{ left: `${frameToPercent(playheadFrame)}%` }}
            />
          </div>

          {/* Tracks */}
          <div className="relative cursor-pointer" onClick={handleTimelineClick}>
            {hasSequences ? (
              tracks.map((track) => (
                <div
                  key={track.type}
                  className="h-10 relative border-b"
                >
                  {track.items.map((item) => (
                    <div
                      key={item.id}
                      className="absolute top-1 bottom-1 rounded-md flex items-center px-2 text-xs font-medium truncate cursor-pointer hover:brightness-110 transition-all text-white"
                      style={{
                        left: `${frameToPercent(item.from)}%`,
                        width: `${frameToPercent(item.durationInFrames)}%`,
                        background: TRACK_COLORS[item.type],
                      }}
                      title={`${item.name} (${item.from}-${item.from + item.durationInFrames} frames)`}
                    >
                      {item.name}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="h-10 relative border-b flex items-center justify-center text-muted-foreground">
                <span className="text-xs">Waiting for composition data...</span>
              </div>
            )}

            {/* Playhead line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 z-10 pointer-events-none bg-primary"
              style={{
                left: `${frameToPercent(playheadFrame)}%`,
                boxShadow: '0 0 8px hsl(var(--primary) / 0.5)',
              }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
