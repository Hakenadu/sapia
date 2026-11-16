import { toIdentifier } from '@sapia/core';
import type { ModelMapper, StateModel, StateNode, StateTransition } from '@sapia/core';
import { contentLines, decodeText, encodeQuoted, encodeText } from './util';
import type { Warn } from './util';

const ID = String.raw`\[\*\]|\w+(?:[-.]\w+)*`;
const TRANSITION = new RegExp(String.raw`^(${ID})\s*-->\s*(${ID})\s*(?::\s*(.*))?$`);

export function parseState(source: string, warn: Warn): StateModel {
  const { lines, title } = contentLines(source);
  const model: StateModel = { kind: 'state', title, states: [], transitions: [] };
  const all = new Map<string, StateNode>();
  const stack: { states: StateNode[]; transitions: StateTransition[] }[] = [{ states: model.states, transitions: model.transitions }];

  const state = (id: string): string => {
    if (id === '[*]') return id;
    if (!all.has(id)) {
      const n: StateNode = { id, descriptions: [] };
      all.set(id, n);
      stack[stack.length - 1].states.push(n);
    }
    return id;
  };

  for (let i = 0; i < lines.length; i++) {
    const { text, line } = lines[i];
    let m: RegExpExecArray | null;
    if ((m = /^title:?\s+(.*)$/i.exec(text))) {
      model.title = decodeText(m[1]);
      continue;
    }
    if ((m = /^direction\s+(\w+)$/.exec(text))) {
      if (stack.length === 1) model.direction = m[1] === 'LR' || m[1] === 'RL' ? 'LR' : 'TB';
      continue;
    }
    if ((m = /^state\s+"(.*)"\s+as\s+(\w+(?:[-.]\w+)*)\s*(\{)?$/.exec(text))) {
      const n = all.get(state(m[2]))!;
      n.label = decodeText(m[1]);
      if (m[3]) {
        n.states ??= [];
        n.transitions ??= [];
        stack.push({ states: n.states, transitions: n.transitions });
      }
      continue;
    }
    if ((m = /^state\s+(\w+(?:[-.]\w+)*)\s*(?:<<\s*(\w+)\s*>>)?\s*(\{)?$/.exec(text))) {
      const n = all.get(state(m[1]))!;
      const stereo = m[2]?.toLowerCase();
      if (stereo === 'choice' || stereo === 'fork' || stereo === 'join') n.type = stereo;
      if (m[3]) {
        n.states ??= [];
        n.transitions ??= [];
        stack.push({ states: n.states, transitions: n.transitions });
      }
      continue;
    }
    if (text === '}') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (text === '--') continue; // concurrency separator
    if ((m = TRANSITION.exec(text))) {
      stack[stack.length - 1].transitions.push({ from: state(m[1]), to: state(m[2]), label: m[3] ? decodeText(m[3]) : undefined });
      continue;
    }
    if ((m = /^(\w+(?:[-.]\w+)*)\s*:\s*(.+)$/.exec(text))) {
      all.get(state(m[1]))!.descriptions.push(decodeText(m[2]));
      continue;
    }
    if (/^note\b/.test(text)) {
      if (!text.includes(':')) while (++i < lines.length && !/^end note$/.test(lines[i].text));
      warn(line, text);
      continue;
    }
    if (/^(classDef|class|accTitle|accDescr)\b/.test(text)) continue;
    warn(line, text);
  }
  return model;
}

export function generateState(model: StateModel): string {
  const out: string[] = [];
  if (model.title) out.push('---', `title: ${model.title.replace(/\n/g, ' ')}`, '---');
  out.push('stateDiagram-v2');
  if (model.direction === 'LR') out.push('  direction LR');
  const taken = new Set<string>();
  const ids = new Map<string, string>();
  const collect = (states: StateNode[]) => {
    for (const s of states) {
      ids.set(s.id, toIdentifier(s.id, taken, 's'));
      collect(s.states ?? []);
    }
  };
  collect(model.states);
  const ref = (id: string) => (id === '[*]' ? id : (ids.get(id) ?? toIdentifier(id, undefined, 's')));

  const emit = (states: StateNode[], transitions: StateTransition[], indent: string) => {
    for (const s of states) {
      const id = ref(s.id);
      const label = s.label ?? (id !== s.id ? s.id : undefined);
      const composite = !!(s.states?.length || s.transitions?.length);
      if (s.type && s.type !== 'state') out.push(`${indent}state ${id} <<${s.type}>>`);
      else if (composite) {
        if (label) out.push(`${indent}state "${encodeQuoted(label)}" as ${id} {`);
        else out.push(`${indent}state ${id} {`);
        emit(s.states ?? [], s.transitions ?? [], `${indent}  `);
        out.push(`${indent}}`);
      } else if (label) out.push(`${indent}state "${encodeQuoted(label)}" as ${id}`);
      for (const d of s.descriptions) out.push(`${indent}${id} : ${encodeText(d)}`);
    }
    for (const t of transitions) out.push(`${indent}${ref(t.from)} --> ${ref(t.to)}${t.label ? `: ${encodeText(t.label)}` : ''}`);
  };
  emit(model.states, model.transitions, '  ');
  return out.join('\n') + '\n';
}

export function stateMapper(warning: (line: number, text: string) => string): ModelMapper<StateModel> {
  return {
    languageId: 'mermaid',
    diagramType: 'state',
    parse(source) {
      const warnings: string[] = [];
      const model = parseState(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateState,
  };
}
