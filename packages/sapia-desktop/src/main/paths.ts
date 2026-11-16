import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Locations of everything Sapia Desktop keeps on disk. */
export interface SapiaPaths {
  /** `~/.sapia` (or `$SAPIA_HOME`). */
  home: string;
  config: string;
  diagrams: string;
  /** `npm install --prefix ~/.sapia/plugins <package>` puts plugins here. */
  plugins: string;
}

export function sapiaPaths(env: NodeJS.ProcessEnv = process.env): SapiaPaths {
  const home = env['SAPIA_HOME'] ? resolve(env['SAPIA_HOME']) : join(homedir(), '.sapia');
  return { home, config: join(home, 'config.json'), diagrams: join(home, 'diagrams'), plugins: join(home, 'plugins') };
}

/** Expands `~`, `file:` URLs and paths relative to `base`. */
export function expandPath(target: string, base: string): string {
  let path = target.trim();
  if (path.startsWith('file:')) path = fileURLToPath(path);
  if (path === '~') path = homedir();
  else if (/^~[\\/]/.test(path)) path = join(homedir(), path.slice(2));
  return isAbsolute(path) ? path : resolve(base, path);
}
