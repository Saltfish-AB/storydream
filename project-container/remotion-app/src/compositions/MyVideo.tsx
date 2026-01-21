import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export const MyVideo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation - spring entrance
  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const titleY = interpolate(titleProgress, [0, 1], [50, 0]);
  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);

  // Subtitle animation - delayed entrance
  const subtitleProgress = spring({
    frame: frame - 20,
    fps,
    config: { damping: 200 },
  });

  const subtitleOpacity = interpolate(subtitleProgress, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: 80,
          fontWeight: 700,
          color: 'white',
          textShadow: '0 4px 20px rgba(0,0,0,0.3)',
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          margin: 0,
        }}
      >
        Welcome to StoryDream
      </h1>
      <p
        style={{
          fontSize: 32,
          color: 'rgba(255,255,255,0.9)',
          marginTop: 20,
          opacity: subtitleOpacity,
        }}
      >
        Create videos with AI
      </p>
    </AbsoluteFill>
  );
};
