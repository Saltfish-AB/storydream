import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Use relative paths so preview works behind ingress path routing
  base: './',
  resolve: {
    alias: [
      // Alias for the wrapper to access the real remotion package (must come first)
      {
        find: 'real-remotion',
        replacement: path.resolve(__dirname, 'node_modules/remotion'),
      },
      // Only intercept exact 'remotion' imports, not 'remotion/no-react' etc
      {
        find: /^remotion$/,
        replacement: path.resolve(__dirname, 'src/remotion-wrapper.ts'),
      },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
});
