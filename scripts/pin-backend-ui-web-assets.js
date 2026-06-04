#!/usr/bin/env node
/**
 * After Parcel build: copy hashed web-src.*.js/css to stable names and fix index.html.
 * Prevents Commerce Admin from loading a stale index.html that points at removed hashed files.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(
  __dirname,
  '..',
  'dist',
  'commerce-backend-ui-1',
  'web-prod',
);

if (!fs.existsSync(distDir)) {
  console.warn('pin-backend-ui-web-assets: dist not found, skipping');
  process.exit(0);
}

const files = fs.readdirSync(distDir);
const jsFile = files.find(
  (f) => /^web-src\.[a-f0-9]+\.js$/.test(f) && !f.endsWith('.map'),
);
const cssFile = files.find(
  (f) => /^web-src\.[a-f0-9]+\.css$/.test(f) && !f.endsWith('.map'),
);

if (jsFile) {
  fs.copyFileSync(path.join(distDir, jsFile), path.join(distDir, 'web-src.js'));
  console.log(`Pinned ${jsFile} -> web-src.js`);
}
if (cssFile) {
  fs.copyFileSync(path.join(distDir, cssFile), path.join(distDir, 'web-src.css'));
  console.log(`Pinned ${cssFile} -> web-src.css`);
}

const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/\/web-src\.[a-f0-9]+\.js/g, '/web-src.js');
  html = html.replace(/\/web-src\.[a-f0-9]+\.css/g, '/web-src.css');
  fs.writeFileSync(indexPath, html);
  console.log('Updated index.html to use stable web-src.js / web-src.css');
}
