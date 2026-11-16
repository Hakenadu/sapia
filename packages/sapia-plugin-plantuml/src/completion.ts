import type { CompletionItem, CompletionRequest, CompletionResult } from '@sapia/core';
import { analyzePlantUml, RELATION_RE } from './analysis';
import type { PlantUmlEntity } from './analysis';
import { ARROWS, COLORS, KEYWORDS, SKINPARAMS, THEMES } from './data';
import { TEMPLATES } from './templates';

type Translate = (key: string) => string;

const ENTITY_TOKEN = String.raw`(?:"[^"]+"|\[\*\]|\[[^\]]+\]|\([^)*][^)]*\)|:[^:]+:|[\w.@]+)`;
const ARROW = String.raw`(?:<\|?|[ox*#+^}|]{1,2})?[-.=~]+(?:\[[^\]]*\])?(?:(?:up|down|left|right|[udlr])[-.=~]+)?(?:\|?>{1,2}|[ox*#+^\\/{|]{1,2})?`;

/** `Entity arrow |` – the cursor is where the target entity goes. */
const AFTER_ARROW = new RegExp(String.raw`^\s*${ENTITY_TOKEN}\s*(?:"[^"]*"\s*)?${ARROW}\s+(?:"[^"]*"\s+)?([\w.@\[("]*)$`);
/** `Entity |` – the cursor is where the arrow goes. */
const AFTER_ENTITY = new RegExp(String.raw`^\s*(${ENTITY_TOKEN})\s+([-.<|ox*=~]*)$`);
/** Statements that are followed by an entity reference. */
const ENTITY_STATEMENT = /^\s*(?:activate|deactivate|destroy|create|note\s+(?:left|right|top|bottom)\s+of|note\s+over(?:\s+[\w.@"\[\]() ]+,)?|ref\s+over(?:\s+[\w.@"]+,)?|hide|show|remove)\s+([\w.@\[("]*)$/i;
const AFTER_EXTENDS = /\b(?:extends|implements)\s+(?:[\w.]+\s*,\s*)*([\w.]*)$/;

function entityItems(entities: PlantUmlEntity[], t: Translate, exclude?: string): CompletionItem[] {
  return entities
    .filter((e) => e.ref !== exclude)
    .map((e) => ({
      label: e.ref,
      kind: 'entity' as const,
      detail: e.keyword === 'implicit' ? t('plantuml.completion.implicit') : e.keyword,
      info: e.label,
      boost: 20,
    }));
}

function typeKey(diagramType: string): string {
  return diagramType in KEYWORDS ? diagramType : 'default';
}

export function completePlantUml(request: CompletionRequest, t: Translate): CompletionResult | null {
  const { source, offset, diagramType } = request;
  const analysis = analyzePlantUml(source);
  const { line, column } = analysis.index.positionAt(offset);
  const lineText = analysis.index.lines[line];
  const before = lineText.slice(0, column);
  const lineStart = offset - column;

  if (analysis.freeText[line]) return null;
  if (/^\s*'/.test(before)) return null;
  // Inside an unterminated string.
  if (((before.match(/"/g) ?? []).length & 1) === 1 && !/[\[(]"?[^"]*$/.test(before)) {
    const m = /"([^"]*)$/.exec(before)!;
    // Quoted entity references are still completable right after an arrow.
    if (!AFTER_ARROW.test(before)) return null;
    return { from: offset - m[1].length - 1, items: entityItems(analysis.entities.filter((e) => e.ref.startsWith('"')), t) };
  }

  const hasStart = /^\s*@start\w+/m.test(source);
  if (!hasStart && /^\s*@?\w*$/.test(before)) {
    const word = /@?\w*$/.exec(before)![0];
    if (word.startsWith('@') || source.trim() === word) {
      return {
        from: offset - word.length,
        items: TEMPLATES.map((tpl) => ({
          label: `@start${tpl.tag} – ${t(`diagramType.${tpl.type}`)}`,
          kind: 'snippet' as const,
          detail: 'PlantUML',
          snippet: tpl.snippet,
        })),
      };
    }
  }

  const atWord = /@\w*$/.exec(before);
  if (atWord && before.trim() === atWord[0]) {
    return {
      from: offset - atWord[0].length,
      items: ['@startuml', '@enduml', '@startmindmap', '@endmindmap', '@startwbs', '@endwbs', '@startgantt', '@endgantt', '@startjson', '@endjson', '@startyaml', '@endyaml', '@startsalt', '@endsalt'].map((label) => ({ label, kind: 'keyword' as const })),
    };
  }

  // Colors after `#`.
  const color = /#(\w*)$/.exec(before);
  if (color && !/^\s*#/.test(before)) {
    return { from: offset - color[1].length, items: COLORS.map((c) => ({ label: c, kind: 'color' as const })) };
  }

  const skin = /^\s*skinparam\s+(\w*)$/i.exec(before);
  if (skin) return { from: offset - skin[1].length, items: SKINPARAMS.map((s) => ({ label: s, kind: 'property' as const })) };

  const theme = /^\s*!theme\s+([\w-]*)$/i.exec(before);
  if (theme) return { from: offset - theme[1].length, items: THEMES.map((s) => ({ label: s, kind: 'value' as const })) };

  // Mind maps and WBS have no entity references.
  if (diagramType === 'mindmap' || diagramType === 'wbs') return null;

  // After the label separator everything is free text.
  const withoutStrings = before.replace(/"[^"]*"/g, '""');
  if (/\s:\s|\w:\s/.test(withoutStrings) && RELATION_RE.test(before)) return null;
  if (/^\s*note\b.*:/.test(withoutStrings)) return null;

  const body = analysis.bodyOf[line];
  if (body) {
    const word = /[\w{]*$/.exec(before)![0];
    if (before.trim() !== word) return null;
    return {
      from: offset - word.length,
      items: [
        { label: '+', kind: 'keyword', detail: t('plantuml.completion.public'), insertText: '+' },
        { label: '-', kind: 'keyword', detail: t('plantuml.completion.private'), insertText: '-' },
        { label: '#', kind: 'keyword', detail: t('plantuml.completion.protected'), insertText: '#' },
        { label: '~', kind: 'keyword', detail: t('plantuml.completion.package'), insertText: '~' },
        { label: '{static}', kind: 'keyword' },
        { label: '{abstract}', kind: 'keyword' },
        { label: '--', kind: 'keyword', detail: t('plantuml.completion.separator') },
        { label: 'field', kind: 'snippet', snippet: '${1:+}${2:name}: ${3:Type}' },
        { label: 'method', kind: 'snippet', snippet: '${1:+}${2:name}(${3}): ${4:void}' },
      ],
    };
  }

  const afterArrow = AFTER_ARROW.exec(before);
  if (afterArrow) {
    const source0 = RELATION_RE.exec(before + 'x')?.[1];
    const items = entityItems(analysis.entities.filter((e) => !e.container || diagramType !== 'sequence'), t, diagramType === 'class' ? source0 : undefined);
    if (diagramType === 'state') items.unshift({ label: '[*]', kind: 'entity', detail: t('plantuml.completion.startEnd'), boost: 10 });
    return { from: offset - afterArrow[1].length, items };
  }

  const stmt = ENTITY_STATEMENT.exec(before);
  if (stmt) return { from: offset - stmt[1].length, items: entityItems(analysis.entities, t) };

  const ext = AFTER_EXTENDS.exec(before);
  if (ext) return { from: offset - ext[1].length, items: entityItems(analysis.entities, t) };

  const afterEntity = AFTER_ENTITY.exec(before);
  if (afterEntity) {
    const first = afterEntity[1];
    const known = analysis.entities.some((e) => e.ref === first || e.id === first) || first === '[*]';
    const declarationKeyword = KEYWORDS[typeKey(diagramType)].declarations.concat(KEYWORDS['default'].declarations).some((k) => k.split(' ')[0] === first.toLowerCase());
    if (known && !declarationKeyword) {
      const arrows = ARROWS[diagramType] ?? ARROWS['default'];
      return {
        from: offset - afterEntity[2].length,
        items: arrows.map((a, i) => ({
          label: a.arrow,
          kind: 'arrow' as const,
          detail: t(`plantuml.arrow.${a.key}`),
          insertText: `${a.arrow} `,
          boost: 30 - i,
        })),
      };
    }
    return null;
  }

  // Start of a statement: keywords, snippets and entities that may start a relation.
  const word = /[\w!.@\[(]*$/.exec(before)![0];
  if (before.trim() !== word) return null;
  if (!word && !request.explicit) return null;
  const set = KEYWORDS[typeKey(diagramType)];
  const items: CompletionItem[] = [
    ...entityItems(analysis.entities.filter((e) => !e.container), t).map((i) => ({ ...i, boost: 5 })),
    ...set.declarations.map((label) => ({ label, kind: 'keyword' as const, detail: t('plantuml.completion.declaration'), insertText: `${label} `, boost: 10 })),
    ...set.snippets.map((s) => ({ label: s.label, kind: 'snippet' as const, detail: t(`plantuml.snippet.${s.key}`), snippet: s.snippet, boost: 8 })),
    ...set.statements.map((label) => ({ label, kind: 'keyword' as const })),
  ];
  if (diagramType === 'state') items.push({ label: '[*]', kind: 'entity', detail: t('plantuml.completion.startEnd'), boost: 12 });
  return { from: lineStart + (before.length - word.length), items };
}
