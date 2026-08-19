#!/usr/bin/env node
// "Build": copy the game to dist/ (pure ES modules — no bundling required)
// and verify every module imports cleanly under Node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const COPY = ['index.html', 'style.css', 'src', 'assets'];
for (const item of COPY) {
  const from = path.join(root, item);
  const to = path.join(dist, item);
  fs.cpSync(from, to, { recursive: true });
}
console.log('Copied game files to dist/');
console.log('Verifying module graph (headless)...');
execSync('node tools/headless.js', { cwd: root, stdio: 'inherit' });
console.log('Build OK — open dist/index.html with tools/serve.js or any static server.');
