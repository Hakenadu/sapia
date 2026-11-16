import { definePlugin } from '@sapia/core';
import type { LanguageSupport } from '@sapia/core';
import { mermaidSymbols } from './analysis';
import { completeMermaid } from './completion';
import { detectMermaid } from './detect';
import { classMapper } from './mappers/class';
import { mindmapMapper } from './mappers/mindmap';
import { sequenceMapper } from './mappers/sequence';
import { stateMapper } from './mappers/state';
import { messagesDe, messagesEn } from './messages';
import { createRenderer, createValidator, locateMermaid } from './render';
import type { MermaidOptions } from './render';
import { DIAGRAM_TYPES } from './templates';
import { mermaidTokenizer } from './tokenizer';

export { detectMermaid, readPreamble } from './detect';
export { analyzeMermaid, mermaidSymbols } from './analysis';
export { completeMermaid } from './completion';
export { mermaidTokenizer } from './tokenizer';
export { toDiagnostic, locateMermaid } from './render';
export { parseSequence, generateSequence } from './mappers/sequence';
export { parseClass, generateClass } from './mappers/class';
export { parseState, generateState } from './mappers/state';
export { parseMindmap, generateMindmap } from './mappers/mindmap';

export const MERMAID_LANGUAGE_ID = 'mermaid';

/**
 * Mermaid support for Sapia.
 *
 * Options (`pluginOptions["sapia.mermaid"]`): `fontFamily`, `theme`,
 * `themeVariables` – see {@link MermaidOptions}.
 */
export const mermaidPlugin = definePlugin({
  id: 'sapia.mermaid',
  name: 'Mermaid',
  version: '0.1.0',
  description: 'Mermaid diagrams: flowcharts, sequence, class, state, ER, mind maps and more.',
  activate(ctx) {
    ctx.i18n.addMessages('en', messagesEn);
    ctx.i18n.addMessages('de', messagesDe);
    const t = ctx.i18n.t;
    const options = ctx.options as MermaidOptions;

    const language: LanguageSupport = {
      id: MERMAID_LANGUAGE_ID,
      name: 'Mermaid',
      fileExtensions: ['mmd', 'mermaid'],
      diagramTypes: DIAGRAM_TYPES,
      lineComment: '%%',
      detect: detectMermaid,
      tokenizer: mermaidTokenizer,
      complete: (request) => completeMermaid(request, t),
      validate: createValidator(options, t),
      symbols: (source, diagramType) => mermaidSymbols(source, diagramType),
      render: createRenderer(options, t),
      locate: locateMermaid,
    };
    ctx.languages.register(language);

    const warning = (line: number, text: string) => t('mermaid.warning.notConverted', { line: line + 1, text });
    ctx.conversion.registerMapper(sequenceMapper(warning));
    ctx.conversion.registerMapper(classMapper(warning));
    ctx.conversion.registerMapper(stateMapper(warning));
    ctx.conversion.registerMapper(mindmapMapper(warning));
  },
});

export default mermaidPlugin;
