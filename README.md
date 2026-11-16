# Sapia

A modern editor for text-based diagrams. Write PlantUML or Mermaid on the left, see the diagram on the right, click any element to jump to its source.

- **Automatic detection** of the language (PlantUML, Mermaid, …) and the diagram type (sequence, class, state, mind map, …).
- **Context-aware completion**: keywords, snippets and the names already used in the diagram, offered only where the syntax allows them.
- **Conversion between languages** through a metamodel per diagram type (sequence, class, state, mind map).
- **Live preview** with pan and zoom, click-to-source, SVG and PNG export. PlantUML is rendered locally, without a server or Java.
- **Highlighting and diagnostics** per language, with errors marked in the editor.
- **Library** to save diagrams and open them again.
- **Light and dark mode**, following the system by default. **English and German** UI.
- **Plugins** for languages, converters, completion, rendering and AI tools. PlantUML and Mermaid are plugins themselves.
- **AI assistant** in the desktop app, one shortcut away (`Ctrl/Cmd+K`), with tools to create, edit, check and convert diagrams.

## Packages

| Package | Purpose |
| --- | --- |
| [`packages/sapia-core`](packages/sapia-core) (`@sapia/core`) | Everything that is not UI: plugin system, language registry and detection, tokenizer toolkit, metamodels, conversion, i18n, config, storage and the AI tool contracts. |
| [`packages/sapia-plugin-plantuml`](packages/sapia-plugin-plantuml) | PlantUML support, built on `@plantuml/core`. |
| [`packages/sapia-plugin-mermaid`](packages/sapia-plugin-mermaid) | Mermaid support. |
| [`packages/sapia-web`](packages/sapia-web) | The web application: Angular (zoneless) with Angular Material and CodeMirror 6. |
| [`packages/sapia-desktop`](packages/sapia-desktop) (`@sapia/desktop`) | The desktop application: Electron shell around `sapia-web`, plus config file, npm/local plugins and the AI backend. |
| [`examples/sapia-plugin-dot`](examples/sapia-plugin-dot) | A dependency-free example plugin (Graphviz DOT). |

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm start            # web app on http://localhost:4200
npm run start:desktop  # builds everything and opens the desktop app
npm test             # unit tests
npm run build        # libraries, web app and desktop bundle
```

## Sapia Desktop

```bash
npm install -g @sapia/desktop
sapia
```

On first start, Sapia asks for language and theme, optionally connects an AI provider (with a connection test) and writes `~/.sapia/config.json`. Diagrams are stored as files in `~/.sapia/diagrams`. Set `SAPIA_HOME` to use another directory.

### Configuration (`~/.sapia/config.json`)

```jsonc
{
  "version": 1,
  "locale": "auto",            // "auto", "en" or "de"; unknown locales fall back to English
  "theme": "system",           // "system", "light" or "dark"
  "editor": { "fontSize": 14, "tabSize": 2, "lineNumbers": true, "wordWrap": false, "renderDelay": 250 },

  "plugins": [
    "sapia-plugin-d2",                         // npm package
    "~/dev/my-plugin",                         // local folder or file
    { "package": "@acme/sapia-c4", "options": { "strict": true } },
    { "path": "./plugins/experimental", "enabled": false }
  ],
  "disabledPlugins": [],                       // plugin ids, e.g. "sapia.mermaid"
  "pluginOptions": { "sapia.plantuml": { "look": "sapia" } },

  "ai": {
    "enabled": true,
    "provider": "openai",
    "maxSteps": 12,
    "providers": {
      "openai": { "type": "openai-responses", "model": "gpt-5", "apiKeyEnv": "OPENAI_API_KEY" },
      "local":  { "type": "openai-chat", "model": "qwen3", "baseUrl": "http://localhost:11434/v1" }
    }
  },

  "storage": { "directory": "~/Documents/diagrams" },
  "keybindings": { "aiAssistant": "Mod-k", "save": "Mod-s", "newDiagram": "Mod-Alt-n", "openLibrary": "Mod-o", "convert": "Mod-Shift-e" }
}
```

Every key is optional. Problems in the file are listed under *Plugins & settings → Configuration*; Sapia never overwrites a file it cannot parse.

### Plugins from npm or a local path

```bash
npm install --prefix ~/.sapia/plugins sapia-plugin-d2
```

Then add the package name to `plugins`. Packages are looked up in `~/.sapia/plugins/node_modules`, next to a globally installed `@sapia/desktop`, in `NODE_PATH` and in the global npm root. A path may point to a package folder or to a single module file.

### AI providers

Two provider types are built in, both running through the [Vercel AI SDK](https://ai-sdk.dev) in the main process:

| `type` | API |
| --- | --- |
| `openai-responses` | OpenAI Responses API |
| `openai-chat` | OpenAI Chat Completions, also spoken by most compatible servers (set `baseUrl`) |

The key comes from `apiKey`, from the environment variable named in `apiKeyEnv`, or from `OPENAI_API_KEY`. It stays in the main process: the UI only receives a redacted config, and the model's tool calls are executed in the UI against the open workspace.

Plugins can add provider types, see below.

## Sapia Web

`npm run build:web` produces a static site in `packages/sapia-web/dist/sapia-web/browser`. It optionally loads `config.json` from its own deployment URL (see [`config.example.json`](packages/sapia-web/public/config.example.json)); plugins are referenced there by URL. For a deployment below a sub-path, build with `--base-href /your/path/`. Diagrams are kept in the browser's local storage. The AI assistant is part of the desktop app, because a browser cannot keep an API key secret.

## Writing a plugin

A plugin is an ES module whose default export has an `id` and an `activate(context)` function. Everything registered through the context is removed again when the plugin is deactivated.

```ts
import { definePlugin } from '@sapia/core';

export default definePlugin({
  id: 'acme.d2',
  name: 'D2',
  activate(context) {
    context.languages.register({
      id: 'd2',
      name: 'D2',
      diagramTypes: [{ id: 'graph', template: 'a -> b\n' }],
      detect: (source) => (/^\s*\w+\s*->\s*\w+/m.test(source) ? { confidence: 0.5, diagramType: 'graph' } : null),
      tokenizer,        // highlighting
      complete,         // completion, with access to source and cursor
      validate,         // diagnostics
      render,           // returns an SVG
      locate,           // maps a clicked SVG element to a source range
    });
    context.conversion.registerMapper(sequenceMapper); // language <-> metamodel of one diagram type
    context.ai.registerTool(myTool);                   // extra tool for the assistant
    context.i18n.addMessages('de', { 'diagramType.graph': 'Graph' });
  },
});
```

Conversion always goes through a metamodel: a mapper parses its language into the model of one diagram type and generates the language from it. Two languages can be converted into each other as soon as both have a mapper for the same diagram type.

The module is loaded by the UI as it is, so bundle its dependencies. In `package.json`, point `sapia.plugin` at the module:

```json
{ "name": "sapia-plugin-d2", "sapia": { "plugin": "./dist/index.js", "main": "./dist/main.cjs" } }
```

`sapia.main` is optional and names a module for the desktop main process. Its `activate` can register AI provider types:

```js
exports.activate = (context) => {
  context.registerAiProvider({
    info: { id: 'anthropic', name: 'Anthropic', defaultModel: '…', apiKeyEnv: 'ANTHROPIC_API_KEY' },
    createModel: ({ config, apiKey }) => createAnthropic({ apiKey })(config.model), // any AI SDK language model
  });
};
```

[`examples/sapia-plugin-dot`](examples/sapia-plugin-dot) is a complete plugin in one file.

## Architecture

```
sapia-core            languages · detection · metamodels · conversion · i18n · config · AI tools · plugin manager
   ▲        ▲
   │        └── sapia-plugin-plantuml, sapia-plugin-mermaid, your plugins
sapia-web             Angular shell, CodeMirror editor, preview, library, AI widget, onboarding UI
   ▲
sapia-desktop         Electron: serves sapia-web, ~/.sapia/config.json, plugin resolution, diagram files, AI backend
```

The desktop app adds a small delta to the web app: the page runs sandboxed with context isolation and talks to the main process through one narrow bridge (`window.sapiaHost`, typed as `SapiaHost` in `@sapia/core`). Without that bridge, the same build behaves as the web app.
