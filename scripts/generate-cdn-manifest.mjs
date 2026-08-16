#!/usr/bin/env node
/**
 * Builds manifest.json for the static CDN.
 *
 * Walks static-assets/, recording every file's size, SHA-256 and Content-Type keyed
 * by its CDN key (the path relative to the root). media-service reads this to serve
 * checksum-based ETags — which is what lets a re-sync that only touches mtimes leave
 * browser caches intact.
 *
 * Usage: node scripts/generate-cdn-manifest.mjs <sourceDir> [outputFile]
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, extname, sep } from 'node:path';

// Mirrors CdnProperties.mimeTypes on the Java side. Keep the two in sync — the
// manifest value wins at serve time, so a wrong entry here is what the client gets.
const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.vtt': 'text/vtt',
  '.srt': 'application/x-subrip',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.map': 'application/json',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
};

// Never shipped to the VPS or listed in the manifest.
const EXCLUDED = new Set(['.DS_Store', 'Thumbs.db', 'manifest.json', '.gitkeep']);

const sourceDir = process.argv[2];
const outputFile = process.argv[3] ?? join(sourceDir ?? '.', 'manifest.json');

if (!sourceDir) {
  console.error('Usage: node scripts/generate-cdn-manifest.mjs <sourceDir> [outputFile]');
  process.exit(1);
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitkeep') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && !EXCLUDED.has(entry.name)) {
      yield full;
    }
  }
}

const assets = {};
let totalBytes = 0;
let count = 0;

for await (const filePath of walk(sourceDir)) {
  // CDN keys always use forward slashes, regardless of the build host's separator.
  const key = relative(sourceDir, filePath).split(sep).join('/');
  const { size } = await stat(filePath);
  const digest = await sha256(filePath);
  const ext = extname(filePath).toLowerCase();

  assets[key] = {
    size,
    sha256: digest,
    contentType: MIME_TYPES[ext] ?? 'application/octet-stream',
  };

  totalBytes += size;
  count += 1;
  console.log(`  ${key}  ${(size / 1024 / 1024).toFixed(2)} MB  ${digest.slice(0, 12)}`);
}

// Sort keys so the manifest has stable ordering and stays diffable across runs
// (only generatedAt/commit should move when the asset tree is unchanged).
const sorted = Object.fromEntries(Object.keys(assets).sort().map((k) => [k, assets[k]]));

const manifest = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? 'local',
  assets: sorted,
};

await writeFile(outputFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`\nManifest: ${count} assets, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total`);
console.log(`Written to ${outputFile}`);
