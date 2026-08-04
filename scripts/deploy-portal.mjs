/**
 * Build portal and copy SPA assets into Laravel public/ without removing
 * index.php, .htaccess, or other server files.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portalDir = path.join(root, 'portal');
const distDir = path.join(portalDir, 'dist');
const publicDir = path.join(root, 'public');

const PROTECTED = new Set(['index.php', '.htaccess', 'robots.txt', 'favicon.ico', 'web.config']);

function rmrf(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log('Building portal…');
execSync('npm run build', { cwd: portalDir, stdio: 'inherit' });

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('portal/dist/index.html missing after build');
  process.exit(1);
}

// Replace hashed asset bundle directory
const distAssets = path.join(distDir, 'assets');
const publicAssets = path.join(publicDir, 'assets');
if (fs.existsSync(distAssets)) {
  rmrf(publicAssets);
  copyRecursive(distAssets, publicAssets);
  console.log('Copied assets/');
}

// Icons
const distIcons = path.join(distDir, 'icons');
if (fs.existsSync(distIcons)) {
  copyRecursive(distIcons, path.join(publicDir, 'icons'));
  console.log('Copied icons/');
}

// Root-level build outputs (SW, workbox, manifest, index.html, etc.)
for (const name of fs.readdirSync(distDir)) {
  if (name === 'assets' || name === 'icons') {
    continue;
  }
  if (PROTECTED.has(name)) {
    console.warn(`Skipping protected name from dist: ${name}`);
    continue;
  }
  const src = path.join(distDir, name);
  const dest = path.join(publicDir, name);
  if (fs.statSync(src).isDirectory()) {
    copyRecursive(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log(`Copied ${name}`);
}

// Sanity: Laravel front controller still present
for (const required of ['index.php', '.htaccess']) {
  if (!fs.existsSync(path.join(publicDir, required))) {
    console.error(`FATAL: ${required} missing from public/`);
    process.exit(1);
  }
}

console.log('Portal deployed to public/');
