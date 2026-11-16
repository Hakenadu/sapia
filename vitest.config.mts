import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sapia/core': r('./packages/sapia-core/src/index.ts'),
      '@sapia/plugin-plantuml': r('./packages/sapia-plugin-plantuml/src/index.ts'),
      '@sapia/plugin-mermaid': r('./packages/sapia-plugin-mermaid/src/index.ts'),
    },
  },
  test: {
    include: ['packages/sapia-{core,plugin-plantuml,plugin-mermaid,desktop}/**/*.spec.ts'],
    environment: 'node',
  },
});
