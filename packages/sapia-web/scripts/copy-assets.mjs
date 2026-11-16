// Copies the PlantUML engine next to the app so the PlantUML plugin can load it
// as a static asset (the Angular builder only accepts assets inside the package).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('@plantuml/core/package.json'));
const target = join(here, '..', 'vendor', 'plantuml');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of ['plantuml.js', 'viz-global.js', 'themes.js', 'emoji.js', 'openiconic.js', 'LICENSE']) {
  cpSync(join(source, file), join(target, file));
}
