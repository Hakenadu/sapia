import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.puml': 'text/plain; charset=utf-8',
};

export const APP_HOST = 'app';

export interface StaticRoots {
  /** The built web application. */
  web: string;
  /** Plugin directories by host name (`plugin-0`, `plugin-1`, …). */
  plugins: Map<string, string>;
  /** Extra origins the UI may load plugin modules from (plugins referenced by URL). */
  remoteOrigins: string[];
}

export function contentSecurityPolicy(remoteOrigins: string[]): string {
  const remote = remoteOrigins.join(' ');
  return [
    "default-src 'self' sapia:",
    // Graphviz (used by PlantUML) is WebAssembly; this allows compiling wasm but not eval().
    `script-src 'self' sapia: 'wasm-unsafe-eval' ${remote}`.trim(),
    "style-src 'self' sapia: 'unsafe-inline'",
    "img-src 'self' sapia: data: blob:",
    "font-src 'self' sapia: data:",
    `connect-src 'self' sapia: ${remote}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Maps a `sapia://host/path` URL to a file below one of the roots; null when it must not be served. */
export function resolveRequest(url: string, roots: StaticRoots): { file: string; root: string; spaFallback: boolean } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'sapia:') return null;
  const root = parsed.hostname === APP_HOST ? roots.web : roots.plugins.get(parsed.hostname);
  if (!root) return null;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  const file = normalize(join(root, path));
  const base = root.endsWith(sep) ? root : root + sep;
  if (file !== root && !file.startsWith(base)) return null;
  return { file, root, spaFallback: parsed.hostname === APP_HOST && !extname(path) };
}

/** Serves the web app and the plugins from disk. */
export async function serveStatic(url: string, roots: StaticRoots): Promise<Response> {
  const target = resolveRequest(url, roots);
  if (!target) return new Response('Not found', { status: 404 });
  let file = target.file;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    if (!target.spaFallback) return new Response('Not found', { status: 404 });
    file = join(target.root, 'index.html');
  }
  try {
    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers: Record<string, string> = {
      'content-type': type,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      // Plugin modules are imported from the app's origin.
      'access-control-allow-origin': `sapia://${APP_HOST}`,
    };
    if (type.startsWith('text/html')) headers['content-security-policy'] = contentSecurityPolicy(roots.remoteOrigins);
    return new Response(new Uint8Array(body), { status: 200, headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
