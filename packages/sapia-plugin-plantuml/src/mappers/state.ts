import type { ModelMapper, StateModel, StateNode, StateTransition } from '@sapia/core';
import { contentLines, decodeText, encodeText, unquote } from './util';
import type { Warn } from './util';

const NAME = String.raw`"[^"]+"|\[\*\]|[\w.]+`;
const TRANSITION = new RegExp(
  String.raw`^(${NAME})\s*(<)?-+(?:\[[^\]]*\])?(?:up|down|left|right|[udlr])?-*(>)?\s*(${NAME})\s*(?::\s*(.*))?$`,
);
const STATE_DECL = new RegExp(
  String.raw`^state\s+(${NAME})(?:\s+as\s+(${NAME}))?\s*(?:<<\s*(\w+)\s*>>)?\s*(?:#\w+\s*)?(?::\s*(.*?))?\s*(\{)?$`,
  'i',
);

interface Region {
  states: StateNode[];
  transitions: StateTransition[];
  byId: Map<string, StateNode>;
}

export function parseState(source: string, warn: Warn): StateModel {
  const model: StateModel = { kind: 'state', states: [], transitions: [] };
  const all = new Map<string, StateNode>();
  const stack: Region[] = [{ states: model.states, transitions: model.transitions, byId: new Map() }];

  const state = (token: string): string => {
    const id = unquote(token);
    if (id === '[*]') return id;
    if (!all.has(id)) {
      const n: StateNode = { id, descriptions: [] };
      all.set(id, n);
      stack[stack.length - 1].states.push(n);
    }
    return id;
  };

  for (const { text, line } of contentLines(source)) {
    let m: RegExpExecArray | null;
    if ((m = /^title\s+(.*)$/i.exec(text))) {
      model.title = decodeText(m[1]);
      continue;
    }
    if (/^left to right direction$/i.test(text)) {
      model.direction = 'LR';
      continue;
    }
    if (/^top to bottom direction$/i.test(text)) {
      model.direction = 'TB';
      continue;
    }
    if ((m = STATE_DECL.exec(text))) {
      const first = m[1];
      const alias = m[2];
      const firstIsLabel = !!alias && (first.startsWith('"') || !alias.startsWith('"'));
      const id = state(alias ? (firstIsLabel ? alias : first) : first);
      const n = all.get(id)!;
      if (alias) n.label = decodeText(unquote(firstIsLabel ? first : alias));
      const stereo = m[3]?.toLowerCase();
      if (stereo === 'choice' || stereo === 'fork' || stereo === 'join') n.type = stereo;
      if (m[4]) n.descriptions.push(decodeText(m[4]));
      if (m[5]) {
        n.states ??= [];
        n.transitions ??= [];
        stack.push({ states: n.states, transitions: n.transitions, byId: new Map() });
      }
      continue;
    }
    if (text === '}') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (/^(--|\|\|)$/.test(text)) continue; // concurrent region separator
    if ((m = TRANSITION.exec(text))) {
      const reversed = !!m[2] && !m[3];
      const a = state(m[1]);
      const b = state(m[4]);
      stack[stack.length - 1].transitions.push({
        from: reversed ? b : a,
        to: reversed ? a : b,
        label: m[5] ? decodeText(m[5]) : undefined,
      });
      continue;
    }
    if ((m = new RegExp(String.raw`^(${NAME})\s*:\s*(.+)$`).exec(text)) && m[1] !== '[*]') {
      all.get(state(m[1]))!.descriptions.push(decodeText(m[2]));
      continue;
    }
    if (/^[rh]?note\b/i.test(text) || /^end\s*note$/i.test(text)) {
      warn(line, text);
      continue;
    }
    warn(line, text);
  }
  return model;
}

function emit(states: StateNode[], transitions: StateTransition[], out: string[], indent: string): void {
  const ref = (id: string) => (id === '[*]' || /^[\w.]+$/.test(id) ? id : `"${id}"`);
  for (const s of states) {
    const stereo = s.type && s.type !== 'state' ? ` <<${s.type}>>` : '';
    const name = s.label && s.label !== s.id ? `"${encodeText(s.label)}" as ${ref(s.id)}` : ref(s.id);
    if (s.states?.length || s.transitions?.length) {
      out.push(`${indent}state ${name}${stereo} {`);
      emit(s.states ?? [], s.transitions ?? [], out, `${indent}  `);
      out.push(`${indent}}`);
    } else if (stereo || (s.label && s.label !== s.id) || !/^[\w.]+$/.test(s.id)) {
      out.push(`${indent}state ${name}${stereo}`);
    }
    for (const d of s.descriptions) out.push(`${indent}${ref(s.id)} : ${encodeText(d)}`);
  }
  for (const t of transitions) {
    out.push(`${indent}${ref(t.from)} --> ${ref(t.to)}${t.label ? ` : ${encodeText(t.label)}` : ''}`);
  }
}

export function generateState(model: StateModel): string {
  const out = ['@startuml'];
  if (model.title) out.push(`title ${encodeText(model.title)}`);
  if (model.direction === 'LR') out.push('left to right direction');
  emit(model.states, model.transitions, out, '');
  out.push('@enduml');
  return out.join('\n') + '\n';
}

export function stateMapper(warning: (line: number, text: string) => string): ModelMapper<StateModel> {
  return {
    languageId: 'plantuml',
    diagramType: 'state',
    parse(source) {
      const warnings: string[] = [];
      const model = parseState(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateState,
  };
}
