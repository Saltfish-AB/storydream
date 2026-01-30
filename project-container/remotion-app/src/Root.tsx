import React from 'react';
import { Composition } from 'remotion';
import { MyVideo } from './compositions/MyVideo';

// Root component required for Remotion CLI rendering
// This registers all compositions that can be rendered
// Remotion CLI expects this to be the default export

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main video composition - 5 seconds at 30fps */}
      <Composition
        id="MyVideo"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 720p version */}
      <Composition
        id="MyVideo720p"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />

      {/* Square format for social media */}
      <Composition
        id="MyVideoSquare"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1080}
      />
    </>
  );
};

// Default export required for Remotion CLI
export default RemotionRoot;
