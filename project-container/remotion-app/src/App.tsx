import { Player } from '@remotion/player';
import { MyVideo } from './compositions/MyVideo';

export const App = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Player
        component={MyVideo}
        compositionWidth={1920}
        compositionHeight={1080}
        durationInFrames={150}
        fps={30}
        style={{
          width: '100%',
          maxWidth: '960px',
          aspectRatio: '16/9',
        }}
        controls
        autoPlay
        loop
      />
    </div>
  );
};
