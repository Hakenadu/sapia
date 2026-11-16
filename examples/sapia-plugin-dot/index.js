// Example Sapia plugin: Graphviz DOT.
//
// A plugin is a self-contained ES module whose default export has an `id`
// and an `activate(context)` function. It needs no build step and no imports;
// for type checking, add `@sapia/core` as a dev dependency and wrap the object
// in `definePlugin(...)`.

const KEYWORDS = ['digraph', 'graph', 'subgraph', 'node', 'edge', 'strict'];
const ATTRIBUTES = ['label', 'shape', 'color', 'fillcolor', 'style', 'rankdir', 'fontname', 'fontsize', 'penwidth', 'arrowhead'];
const SHAPES = ['box', 'ellipse', 'circle', 'diamond', 'cylinder', 'note', 'plaintext', 'record'];

const TEMPLATE = `digraph Pipeline {
  rankdir=LR
  node [shape=box, style=rounded]

  Source -> Build -> Test
  Test -> Deploy [label="on success"]
  Test -> Notify [label="on failure", style=dashed]
}
`;

/** One token per regular expression match, tried in order at the current column. */
const RULES = [
  [/^\s+/, null],
  [/^(?:\/\/|#).*/, 'comment'],
  [/^"(?:[^"\\]|\\.)*"?/, 'string'],
  [/^(?:->|--)/, 'arrow'],
  [/^-?\d+(?:\.\d+)?\b/, 'number'],
  [/^[{}[\]]/, 'bracket'],
  [/^[=;,:]/, 'punctuation'],
  [/^[A-Za-z_]\w*/, (word, rest) => (KEYWORDS.includes(word) ? 'definitionKeyword' : /^\s*=/.test(rest) ? 'type' : 'name')],
];

const tokenizer = {
  startState: () => null,
  tokenizeLine(line) {
    const tokens = [];
    let column = 0;
    while (column < line.length) {
      const rest = line.slice(column);
      let length = 1;
      let type = 'invalid';
      for (const [pattern, kind] of RULES) {
        const match = pattern.exec(rest);
        if (!match) continue;
        length = match[0].length;
        type = typeof kind === 'function' ? kind(match[0], rest.slice(length)) : kind;
        break;
      }
      if (type) tokens.push({ from: column, to: column + length, type });
      column += length;
    }
    return { tokens, state: null };
  },
};

/** Names of all nodes that take part in an edge or are declared on their own line. */
function nodeNames(source) {
  const names = new Set();
  const body = source
    .replace(/\/\/.*|#.*/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\w+\s*=\s*(?:"[^"]*"|\w+)/g, '');
  for (const match of body.matchAll(/("(?:[^"\\]|\\.)*"|[A-Za-z_]\w*)\s*(?=->|--|;|\n)|(?:->|--)\s*("(?:[^"\\]|\\.)*"|[A-Za-z_]\w*)/g)) {
    const name = (match[1] ?? match[2]).replace(/^"|"$/g, '');
    if (name && !KEYWORDS.includes(name) && !ATTRIBUTES.includes(name)) names.add(name);
  }
  return [...names];
}

function complete({ source, offset }) {
  const before = source.slice(0, offset);
  const word = /[A-Za-z_]\w*$/.exec(before)?.[0] ?? '';
  const from = offset - word.length;
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const insideAttributes = line.lastIndexOf('[') > line.lastIndexOf(']');

  if (insideAttributes && /shape\s*=\s*\w*$/.test(line)) return { from, items: SHAPES.map((label) => ({ label, kind: 'value' })) };
  if (insideAttributes) return { from, items: ATTRIBUTES.map((label) => ({ label, kind: 'property', insertText: `${label}=` })) };
  // Existing node names are only offered where a node may appear: at the start of a statement or after an arrow.
  if (/(?:^|;|\{|->|--)\s*\w*$/.test(line)) {
    const nodes = nodeNames(source.slice(0, from) + source.slice(offset)).map((label) => ({ label, kind: 'entity', boost: 10 }));
    const keywords = /(?:->|--)\s*\w*$/.test(line) ? [] : KEYWORDS.map((label) => ({ label, kind: 'keyword' }));
    return { from, items: [...nodes, ...keywords] };
  }
  return null;
}

let vizPromise;
function loadViz(url) {
  vizPromise ??= new Promise((resolve, reject) => {
    if (globalThis.Viz) return resolve(globalThis.Viz.instance());
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(globalThis.Viz.instance());
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });
  vizPromise.catch(() => (vizPromise = undefined));
  return vizPromise;
}

export default {
  id: 'example.dot',
  name: 'Graphviz DOT',
  version: '0.1.0',
  description: 'Example plugin: DOT graphs rendered with Graphviz.',

  activate(context) {
    context.i18n.addMessages('en', { 'diagramType.graph': 'Graph' });
    context.i18n.addMessages('de', { 'diagramType.graph': 'Graph' });

    // Sapia ships Graphviz for PlantUML; reuse it unless told otherwise.
    const vizUrl = typeof context.options.vizUrl === 'string' ? context.options.vizUrl : new URL('plugins/plantuml/viz-global.js', document.baseURI).href;

    context.languages.register({
      id: 'dot',
      name: 'Graphviz DOT',
      fileExtensions: ['.dot', '.gv'],
      diagramTypes: [{ id: 'graph', template: TEMPLATE }],
      lineComment: '//',
      tokenizer,
      complete,

      detect(source) {
        const start = source.replace(/^\s*(?:(?:\/\/|#).*\n\s*)*/, '');
        return /^(?:strict\s+)?(?:di)?graph\b[^{\n]*\{/.test(start) ? { confidence: 0.9, diagramType: 'graph' } : null;
      },

      async render({ source, theme }) {
        const viz = await loadViz(vizUrl);
        const ink = theme === 'dark' ? '#e9ebf3' : '#151821';
        const line = theme === 'dark' ? '#9d91ff' : '#6f61ee';
        const result = viz.render(source, {
          format: 'svg',
          graphAttributes: { bgcolor: 'transparent', fontname: 'Inter', fontcolor: ink },
          nodeAttributes: { fontname: 'Inter', fontcolor: ink, color: line },
          edgeAttributes: { fontname: 'Inter', fontcolor: ink, color: ink },
        });
        if (result.status === 'success') return { svg: result.output };
        return {
          diagnostics: result.errors.map((error) => {
            // Graphviz reports "syntax error in line N near '…'".
            const lineNumber = Number(/line (\d+)/.exec(error.message)?.[1] ?? 1);
            const lines = source.split('\n');
            const index = Math.min(lines.length, Math.max(1, lineNumber)) - 1;
            const from = lines.slice(0, index).reduce((sum, text) => sum + text.length + 1, 0);
            return { from, to: from + lines[index].length, severity: 'error', message: error.message.trim(), source: 'graphviz' };
          }),
        };
      },

      /** Graphviz puts the node name into a <title> inside each node group. */
      locate({ source, path }) {
        for (const element of path) {
          if (element.tag !== 'g' || !element.classes.includes('node')) continue;
          const name = (element.attributes.title ?? '').trim();
          const at = name ? source.search(new RegExp(`(?<![\\w"])"?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?(?![\\w"])`)) : -1;
          if (at >= 0) return { from: at, to: at + source.slice(at).match(/^"?[^"\s;[\]]+"?/)[0].length };
        }
        return null;
      },
    });
  },
};
