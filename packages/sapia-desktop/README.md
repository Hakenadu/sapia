# Sapia Desktop

A modern editor for text-based diagrams (PlantUML, Mermaid and more through plugins) with live preview, click-to-source, conversion between languages and a built-in AI assistant.

```bash
npm install -g @sapia/desktop
sapia
```

Requires Node.js 22 or newer. On first start, Sapia guides you through language, theme and an optional AI provider and writes `~/.sapia/config.json`.

The Electron runtime (about 110 MB) is downloaded into `~/.sapia/electron` on the very first start, without install scripts. Behind a company proxy, Sapia uses `HTTPS_PROXY`/`NO_PROXY` or npm's proxy settings and the operating system's certificates; `ELECTRON_MIRROR` selects an internal mirror. See the [full documentation](https://github.com/Hakenadu/sapia#sapia-desktop).

- Configuration: `~/.sapia/config.json` (`SAPIA_HOME` changes the directory)
- Diagrams: `~/.sapia/diagrams`
- Plugins: `npm install --prefix ~/.sapia/plugins <package>`, then add the package name to `"plugins"` in the config. Local folders work too.
- AI: press `Ctrl/Cmd+K`. Providers are configured under `"ai"`; OpenAI Responses and OpenAI Chat Completions (including compatible servers) are built in.

Full documentation: https://github.com/Hakenadu/sapia#readme
