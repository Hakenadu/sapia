# Sapia Desktop

A modern editor for text-based diagrams (PlantUML, Mermaid and more through plugins) with live preview, click-to-source, conversion between languages and a built-in AI assistant.

```bash
npm install -g @sapia/desktop
sapia
```

Requires Node.js 22 or newer. On first start, Sapia guides you through language, theme and an optional AI provider and writes `~/.sapia/config.json`.

- Configuration: `~/.sapia/config.json` (`SAPIA_HOME` changes the directory)
- Diagrams: `~/.sapia/diagrams`
- Plugins: `npm install --prefix ~/.sapia/plugins <package>`, then add the package name to `"plugins"` in the config. Local folders work too.
- AI: press `Ctrl/Cmd+K`. Providers are configured under `"ai"`; OpenAI Responses and OpenAI Chat Completions (including compatible servers) are built in.

Full documentation: https://github.com/Hakenadu/sapia#readme
