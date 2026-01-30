/**
 * Remotion Server-Side Rendering Script
 * Uses the @remotion/renderer API for production rendering
 * https://www.remotion.dev/docs/renderer
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, ensureBrowser } from '@remotion/renderer';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const RENDER_ID = process.env.RENDER_ID;
const GCS_BUCKET = process.env.GCS_BUCKET || 'storydream-data';
const COMPOSITION_ID = process.env.COMPOSITION_ID || 'MyVideo';
const OUTPUT_FORMAT = process.env.OUTPUT_FORMAT || 'mp4';

// Validate required environment variables
if (!PROJECT_ID || !RENDER_ID) {
  console.error('ERROR: Missing required environment variables PROJECT_ID or RENDER_ID');
  process.exit(1);
}

console.log('=== Starting Remotion Render Job ===');
console.log(`PROJECT_ID: ${PROJECT_ID}`);
console.log(`RENDER_ID: ${RENDER_ID}`);
console.log(`GCS_BUCKET: ${GCS_BUCKET}`);
console.log(`COMPOSITION_ID: ${COMPOSITION_ID}`);
console.log(`OUTPUT_FORMAT: ${OUTPUT_FORMAT}`);

// Initialize GCS client
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET);

// Determine codec based on format
function getCodec(format) {
  switch (format) {
    case 'webm':
      return 'vp8';
    case 'gif':
      return 'gif';
    case 'mp4':
    default:
      return 'h264';
  }
}

// Download project source from GCS
async function downloadSource(destDir) {
  console.log('\n=== Step 1: Downloading source from GCS ===');

  const prefix = `repos/${PROJECT_ID}/src/`;
  const [files] = await bucket.getFiles({ prefix });

  if (files.length === 0) {
    throw new Error(`No source files found at gs://${GCS_BUCKET}/${prefix}`);
  }

  console.log(`Found ${files.length} files to download`);

  for (const file of files) {
    const relativePath = file.name.replace(prefix, '');
    if (!relativePath) continue; // Skip directory markers

    const destPath = path.join(destDir, relativePath);
    const destDirPath = path.dirname(destPath);

    // Create directory if needed
    if (!fs.existsSync(destDirPath)) {
      fs.mkdirSync(destDirPath, { recursive: true });
    }

    await file.download({ destination: destPath });
    console.log(`  Downloaded: ${relativePath}`);
  }

  console.log('Source download complete');
}

// Upload rendered video to GCS
async function uploadOutput(localPath, format) {
  console.log('\n=== Step 4: Uploading to GCS ===');

  const destPath = `repos/${PROJECT_ID}/renders/${RENDER_ID}.${format}`;

  await bucket.upload(localPath, {
    destination: destPath,
    metadata: {
      contentType: format === 'mp4' ? 'video/mp4' : format === 'webm' ? 'video/webm' : 'image/gif',
    },
  });

  console.log(`Uploaded to: gs://${GCS_BUCKET}/${destPath}`);
  return `https://storage.googleapis.com/${GCS_BUCKET}/${destPath}`;
}

// Write completion metadata
async function writeMetadata(outputUrl, duration) {
  console.log('\n=== Step 5: Writing completion metadata ===');

  const metadata = {
    status: 'completed',
    timestamp: new Date().toISOString(),
    format: OUTPUT_FORMAT,
    outputUrl,
    renderDurationMs: duration,
  };

  const destPath = `repos/${PROJECT_ID}/renders/${RENDER_ID}.meta.json`;
  const file = bucket.file(destPath);

  await file.save(JSON.stringify(metadata, null, 2), {
    contentType: 'application/json',
  });

  console.log(`Metadata written to: gs://${GCS_BUCKET}/${destPath}`);
}

// Main render function
async function main() {
  const startTime = Date.now();
  const workDir = path.join(os.tmpdir(), `render-${RENDER_ID}`);
  const srcDir = path.join(workDir, 'src');
  const outputPath = path.join(workDir, `output.${OUTPUT_FORMAT}`);

  try {
    // Ensure Chrome Headless Shell is available
    console.log('=== Ensuring browser is available ===');
    await ensureBrowser({
      onBrowserDownload: () => {
        console.log('Downloading browser...');
        return {
          onProgress: (progress) => {
            console.log(`Downloading browser: ${Math.round(progress * 100)}%`);
          },
        };
      },
    });

    // Create work directory
    fs.mkdirSync(srcDir, { recursive: true });

    // Step 1: Download source
    await downloadSource(srcDir);

    // Create Remotion entry point that calls registerRoot
    const rootPath = path.join(srcDir, 'Root.tsx');

    // Generate Root.tsx if it doesn't exist
    if (!fs.existsSync(rootPath)) {
      console.log('Root.tsx not found, generating it...');
      const rootContent = `
import React from 'react';
import { Composition } from 'remotion';
import { MyVideo } from './compositions/MyVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyVideo"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

export default RemotionRoot;
`;
      fs.writeFileSync(rootPath, rootContent);
      console.log('Generated Root.tsx');
    }

    // Create entry point that registers the root component
    const entryPoint = path.join(srcDir, '_remotion-entry.tsx');
    const entryContent = `
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
`;
    fs.writeFileSync(entryPoint, entryContent);
    console.log('Created Remotion entry point: _remotion-entry.tsx');

    // Step 2: Bundle the project
    console.log('\n=== Step 2: Bundling project ===');
    const bundleLocation = await bundle({
      entryPoint,
      // Enable multi-process on Linux for better performance
      onProgress: (progress) => {
        if (progress % 10 === 0) {
          console.log(`  Bundling: ${progress}%`);
        }
      },
    });
    console.log('Bundle complete');

    // Step 3: Render the video
    console.log('\n=== Step 3: Rendering video ===');
    console.log(`Composition: ${COMPOSITION_ID}`);
    console.log(`Codec: ${getCodec(OUTPUT_FORMAT)}`);

    // Select the composition
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: COMPOSITION_ID,
    });

    console.log(`Video dimensions: ${composition.width}x${composition.height}`);
    console.log(`Duration: ${composition.durationInFrames} frames @ ${composition.fps}fps`);

    // Render with progress tracking
    let lastProgress = 0;
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: getCodec(OUTPUT_FORMAT),
      outputLocation: outputPath,
      // Enable multi-process on Linux for better performance
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
      // Progress callback
      onProgress: ({ progress }) => {
        const percent = Math.round(progress * 100);
        if (percent >= lastProgress + 5) {
          console.log(`  Rendering: ${percent}%`);
          lastProgress = percent;
        }
      },
      // Use optimal concurrency (let Remotion decide, or set based on CPU)
      concurrency: Math.max(1, Math.floor(os.cpus().length * 0.75)),
    });

    console.log('Render complete');

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Render completed but output file not found');
    }

    const stats = fs.statSync(outputPath);
    console.log(`Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Step 4: Upload to GCS
    const outputUrl = await uploadOutput(outputPath, OUTPUT_FORMAT);

    // Step 5: Write metadata
    const duration = Date.now() - startTime;
    await writeMetadata(outputUrl, duration);

    console.log('\n=== Render Complete! ===');
    console.log(`Total time: ${(duration / 1000).toFixed(1)}s`);
    console.log(`Output URL: ${outputUrl}`);

    // Cleanup
    fs.rmSync(workDir, { recursive: true, force: true });

    process.exit(0);
  } catch (error) {
    console.error('\n=== Render Failed ===');
    console.error(error.message);
    console.error(error.stack);

    // Write failure metadata
    try {
      const metadata = {
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
      };

      const destPath = `repos/${PROJECT_ID}/renders/${RENDER_ID}.meta.json`;
      const file = bucket.file(destPath);
      await file.save(JSON.stringify(metadata, null, 2), {
        contentType: 'application/json',
      });
    } catch (metaError) {
      console.error('Failed to write error metadata:', metaError.message);
    }

    process.exit(1);
  }
}

main();
