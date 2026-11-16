# Sapia Web

The Sapia web application as a ready-built static site: a modern editor for text-based diagrams (PlantUML, Mermaid and more through plugins) with live preview, click-to-source and conversion between languages.

```bash
npm install @sapia/web
```

The site lies in `node_modules/@sapia/web/dist/sapia-web/browser`. Copy that folder onto any web server (nginx, Apache, S3, GitHub Pages, …), or try it locally:

```bash
npx http-server node_modules/@sapia/web/dist/sapia-web/browser
```

The package has no runtime dependencies; everything is bundled.

- Configuration: Sapia loads an optional `config.json` from its own deployment URL (see `config.example.json` in the same folder). Plugins are referenced there by URL.
- The build expects to be served from the root path. For a sub-path, build from source with `--base-href /your/path/`.
- Diagrams are kept in the browser's local storage. The AI assistant is part of [`@sapia/desktop`](https://www.npmjs.com/package/@sapia/desktop), because a browser cannot keep an API key secret.

Full documentation: https://github.com/Hakenadu/sapia#readme
