import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The art folder is listed at build time so the app only references images that exist
// (missing stickers fall back to drawn ones, never a 404). Restart the dev server after adding art.
const dir = resolve(import.meta.dirname, 'public/art');
const art = (existsSync(dir) ? readdirSync(dir) : []).filter((f) => /\.(png|webp|jpe?g)$/i.test(f)).sort();
export default defineConfig({ define: { __ART__: JSON.stringify(art) } });
