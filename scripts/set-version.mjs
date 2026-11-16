// Sets one version on the root and every workspace package, including the
// references between @sapia/* packages and package-lock.json, so that a
// release (or the snapshot after it) is one consistent state.
//
//   node scripts/set-version.mjs 1.2.3
//   node scripts/set-version.mjs 1.2.4-snapshot.0
//   node scripts/set-version.mjs --next-snapshot 1.2.3   (prints 1.2.4-snapshot.0, changes nothing)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
if (args[0] === '--next-snapshot') {
  const match = SEMVER.exec(args[1] ?? '');
  if (!match) fail(`Not a version: ${args[1]}`);
  console.log(`${match[1]}.${match[2]}.${Number(match[3]) + 1}-snapshot.0`);
  process.exit(0);
}

const version = (args[0] ?? '').replace(/^v/, '');
if (!SEMVER.test(version)) fail('Usage: node scripts/set-version.mjs <version>  (for example 1.2.3 or v1.2.3)');

const readJson = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const writeJson = (file, value) => writeFileSync(join(root, file), JSON.stringify(value, null, 2) + '\n');

const rootPackage = readJson('package.json');
const workspaces = rootPackage.workspaces;
const names = new Set(workspaces.map((dir) => readJson(join(dir, 'package.json')).name));

/** Exact versions for dependencies, a caret range for peers (plugins work with any compatible core). */
function updateReferences(manifest) {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) if (names.has(name)) manifest[field][name] = version;
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) if (names.has(name)) manifest.peerDependencies[name] = `^${version}`;
}

rootPackage.version = version;
writeJson('package.json', rootPackage);
for (const dir of workspaces) {
  const file = join(dir, 'package.json');
  const manifest = readJson(file);
  manifest.version = version;
  updateReferences(manifest);
  writeJson(file, manifest);
}

const lock = readJson('package-lock.json');
lock.version = version;
lock.packages[''].version = version;
for (const dir of workspaces) {
  const entry = lock.packages[dir.replace(/\\/g, '/')];
  if (!entry) continue;
  entry.version = version;
  updateReferences(entry);
}
writeJson('package-lock.json', lock);

console.log(`Version set to ${version} for ${[...names].join(', ')}.`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
