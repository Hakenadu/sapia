import { definePlugin } from '@sapia/core';
import type { LanguageSupport } from '@sapia/core';
import { plantUmlSymbols } from './analysis';
import { completePlantUml } from './completion';
import { detectPlantUml } from './detect';
import { classMapper } from './mappers/class';
import { mindmapMapper } from './mappers/mindmap';
import { sequenceMapper } from './mappers/sequence';
import { stateMapper } from './mappers/state';
import { messagesDe, messagesEn } from './messages';
import { createRenderer, locatePlantUml } from './render';
import { DIAGRAM_TYPES } from './templates';
import { plantUmlTokenizer } from './tokenizer';
import { validatePlantUml } from './validate';

export { detectPlantUml, detectPlantUmlType } from './detect';
export { analyzePlantUml, plantUmlSymbols } from './analysis';
export { completePlantUml } from './completion';
export { validatePlantUml } from './validate';
export { plantUmlTokenizer } from './tokenizer';
export { parseErrorSvg, locatePlantUml } from './render';
export { parseSequence, generateSequence } from './mappers/sequence';
export { parseClass, generateClass } from './mappers/class';
export { parseState, generateState } from './mappers/state';
export { parseMindmap, generateMindmap } from './mappers/mindmap';

export const PLANTUML_LANGUAGE_ID = 'plantuml';

/**
 * PlantUML support for Sapia.
 *
 * Options (`pluginOptions["sapia.plantuml"]`):
 * - `engineBase`: URL of the directory that serves the `@plantuml/core`
 *   files (`plantuml.js`, `viz-global.js`, …). Defaults to the plugin's
 *   asset directory.
 */
export const plantUmlPlugin = definePlugin({
  id: 'sapia.plantuml',
  name: 'PlantUML',
  version: '0.1.0',
  description: 'PlantUML diagrams, rendered locally with the official PlantUML engine.',
  activate(ctx) {
    ctx.i18n.addMessages('en', messagesEn);
    ctx.i18n.addMessages('de', messagesDe);
    const t = ctx.i18n.t;
    const engineBase = typeof ctx.options['engineBase'] === 'string' ? ctx.options['engineBase'] : ctx.assetUrl('');

    const language: LanguageSupport = {
      id: PLANTUML_LANGUAGE_ID,
      name: 'PlantUML',
      fileExtensions: ['puml', 'plantuml', 'pu', 'iuml', 'wsd'],
      diagramTypes: DIAGRAM_TYPES,
      lineComment: "'",
      detect: detectPlantUml,
      tokenizer: plantUmlTokenizer,
      complete: (request) => completePlantUml(request, t),
      validate: (request) => validatePlantUml(request, t),
      symbols: (source) => plantUmlSymbols(source),
      render: createRenderer({ engineBase, look: ctx.options['look'] === 'plantuml' ? 'plantuml' : 'sapia' }, t),
      locate: locatePlantUml,
    };
    ctx.languages.register(language);

    const warning = (line: number, text: string) => t('plantuml.warning.notConverted', { line: line + 1, text });
    ctx.conversion.registerMapper(sequenceMapper(warning));
    ctx.conversion.registerMapper(classMapper(warning));
    ctx.conversion.registerMapper(stateMapper(warning));
    ctx.conversion.registerMapper(mindmapMapper(warning));
  },
});

export default plantUmlPlugin;
