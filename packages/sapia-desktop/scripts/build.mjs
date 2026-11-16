// Bundles the main process and the preload script and copies the web build,
// so the published package is self-contained apart from Electron itself.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const dist = join(root, 'dist');
const webDist = join(repo, 'packages', 'sapia-web', 'dist', 'sapia-web', 'browser');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (process.argv.includes('--with-web') || !existsSync(join(webDist, 'index.html'))) {
  console.log('Building sapia-web …');
  execSync('npm run build -w sapia-web', { cwd: repo, stdio: 'inherit' });
}

rmSync(dist, { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  alias: { '@sapia/core': join(repo, 'packages', 'sapia-core', 'src', 'index.ts') },
  define: { __SAPIA_VERSION__: JSON.stringify(version) },
  legalComments: 'none',
  logLevel: 'info',
};

await build({ ...common, entryPoints: [join(root, 'src', 'main', 'main.ts')], outfile: join(dist, 'main.cjs'), minifySyntax: true });
await build({ ...common, entryPoints: [join(root, 'src', 'preload', 'preload.ts')], outfile: join(dist, 'preload.cjs'), minifySyntax: true });

cpSync(webDist, join(dist, 'web'), { recursive: true });
console.log(`Sapia Desktop ${version} built to ${dist}`);
