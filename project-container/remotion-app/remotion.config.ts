import { Config } from '@remotion/cli/config';

// Video output format
Config.setVideoImageFormat('jpeg');

// Overwrite existing output files
Config.setOverwriteOutput(true);

// Render concurrency (number of browser instances)
Config.setConcurrency(2);

// For server-side rendering with headless Chrome
Config.setChromiumOpenGlRenderer('angle');
