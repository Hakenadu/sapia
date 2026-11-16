import type { ClassMember, ClassModel, ClassNode, ClassNodeKind, ClassRelation, ClassRelationType, ModelMapper, Visibility } from '@sapia/core';
import { contentLines, decodeText, encodeText, quoteIfNeeded, unquote } from './util';
import type { Warn } from './util';

const NAME = String.raw`"[^"]+"|[\w.]+`;
const DECL = new RegExp(
  String.raw`^(abstract\s+class|abstract|class|interface|enum|annotation|struct|exception|protocol|entity)\s+(${NAME})(?:<([^>]+)>)?(?:\s+as\s+(${NAME}))?\s*(?:<<\s*([^>]+?)\s*>>)?\s*(?:#\w+\s*)?(?:extends\s+([\w.,\s]+?))?\s*(?:implements\s+([\w.,\s]+?))?\s*(\{)?\s*(\})?$`,
  'i',
);
const RELATION = new RegExp(
  String.raw`^(${NAME})\s*(?:"([^"]*)"\s*)?(<\|?|[*o#x+^])?([-.]+)(?:\[[^\]]*\])?(?:up|down|left|right|[udlr])?([-.]*)(\|?>|[*o#x+^])?\s*(?:"([^"]*)"\s*)?(${NAME})\s*(?::\s*(.*))?$`,
);
const VISIBILITY: Record<string, Visibility> = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
const VISIBILITY_CHAR: Record<Visibility, string> = { public: '+', private: '-', protected: '#', package: '~' };

export function parseMember(raw: string): ClassMember | null {
  let text = raw.trim();
  if (!text || /^(--+|\.\.+|==+|__+)(\s.*)?$/.test(text)) return null;
  const member: ClassMember = { text: '', isMethod: false };
  for (;;) {
    const mod = /^\{(static|abstract|classifier|field|method)\}\s*/i.exec(text);
    if (mod) {
      const kind = mod[1].toLowerCase();
      if (kind === 'static' || kind === 'classifier') member.static = true;
      if (kind === 'abstract') member.abstract = true;
      text = text.slice(mod[0].length);
      continue;
    }
    if (!member.visibility && VISIBILITY[text[0]] && text.length > 1) {
      member.visibility = VISIBILITY[text[0]];
      text = text.slice(1).trimStart();
      continue;
    }
    break;
  }
  member.text = text.trim();
  member.isMethod = /\(.*\)/.test(member.text);
  return member.text ? member : null;
}

export function parseClass(source: string, warn: Warn): ClassModel {
  const model: ClassModel = { kind: 'class', classes: [], relations: [], notes: [] };
  const byId = new Map<string, ClassNode>();
  const namespaces: string[] = [];
  /** Brace kinds currently open: namespace or anything else. */
  const braces: ('namespace' | 'other')[] = [];

  const node = (token: string, kind?: ClassNodeKind): ClassNode => {
    const id = unquote(token);
    let n = byId.get(id);
    if (!n) {
      n = { id, kind: kind ?? 'class', members: [], namespace: namespaces[namespaces.length - 1] };
      byId.set(id, n);
      model.classes.push(n);
    } else if (kind) n.kind = kind;
    return n;
  };

  const lines = contentLines(source);
  for (let i = 0; i < lines.length; i++) {
    const { text, line } = lines[i];
    let m: RegExpExecArray | null;

    if ((m = /^title\s+(.*)$/i.exec(text))) {
      model.title = decodeText(m[1]);
      continue;
    }
    if ((m = /^(package|namespace|folder|frame|rectangle)\s+("[^"]+"|[\w.]+).*\{$/i.exec(text))) {
      namespaces.push(unquote(m[2]));
      braces.push('namespace');
      continue;
    }
    if (text === '}') {
      if (braces.pop() === 'namespace') namespaces.pop();
      continue;
    }
    if (/^(left to right|top to bottom) direction$/i.test(text) || /^together\s*\{$/i.test(text)) {
      if (text.endsWith('{')) braces.push('other');
      continue;
    }
    if ((m = DECL.exec(text))) {
      const keyword = m[1].toLowerCase().replace(/\s+/g, ' ');
      const kind: ClassNodeKind =
        keyword === 'interface' || keyword === 'protocol' ? 'interface' : keyword === 'enum' ? 'enum' : keyword.startsWith('abstract') ? 'abstract' : 'class';
      const first = m[2];
      const alias = m[4];
      const firstIsLabel = !!alias && (first.startsWith('"') || !alias.startsWith('"'));
      const n = node(alias ? (firstIsLabel ? alias : first) : first, kind);
      if (alias) n.label = decodeText(unquote(firstIsLabel ? first : alias));
      if (m[3]) n.generic = m[3].trim();
      if (m[5]) n.stereotype = m[5];
      else if (['annotation', 'struct', 'exception', 'entity'].includes(keyword)) n.stereotype = keyword;
      for (const parent of (m[6] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
        node(parent);
        model.relations.push({ from: n.id, to: parent, type: kind === 'interface' ? 'inheritance' : 'inheritance' });
      }
      for (const parent of (m[7] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
        node(parent, 'interface');
        model.relations.push({ from: n.id, to: parent, type: 'realization' });
      }
      if (m[8] && !m[9]) {
        while (++i < lines.length && lines[i].text !== '}') {
          const member = parseMember(lines[i].text);
          if (member) n.members.push(member);
        }
      }
      continue;
    }
    if ((m = /^[rh]?note\s+"([^"]*)"\s+as\s+\w+$/i.exec(text))) {
      model.notes.push({ text: decodeText(m[1]) });
      continue;
    }
    if ((m = /^[rh]?note\s+(?:left|right|top|bottom)(?:\s+of\s+("[^"]+"|[\w.]+))?\s*(?::\s*(.*))?$/i.exec(text))) {
      let noteText = m[2];
      if (noteText === undefined) {
        const collected: string[] = [];
        while (++i < lines.length && !/^end\s*[rh]?note$/i.test(lines[i].text)) collected.push(lines[i].text);
        noteText = collected.join('\n');
      }
      const target = m[1] ? unquote(m[1]) : model.classes[model.classes.length - 1]?.id;
      model.notes.push({ text: decodeText(noteText), target });
      continue;
    }
    if ((m = RELATION.exec(text))) {
      const [, a, cardA, leftHead, body1, body2, rightHead, cardB, b, label] = m;
      const dotted = (body1 + body2).includes('.');
      const A = node(a).id;
      const B = node(b).id;
      let relation: ClassRelation;
      const base = { label: label ? decodeText(label).replace(/^[<>]\s*|\s*[<>]$/g, '') || undefined : undefined };
      const make = (from: string, to: string, type: ClassRelationType, flip: boolean): ClassRelation => ({
        from,
        to,
        type,
        ...base,
        fromCardinality: (flip ? cardB : cardA) || undefined,
        toCardinality: (flip ? cardA : cardB) || undefined,
      });
      if (leftHead === '<|' || leftHead === '^') relation = make(B, A, dotted ? 'realization' : 'inheritance', true);
      else if (rightHead === '|>' || rightHead === '^') relation = make(A, B, dotted ? 'realization' : 'inheritance', false);
      else if (leftHead === '*') relation = make(A, B, 'composition', false);
      else if (rightHead === '*') relation = make(B, A, 'composition', true);
      else if (leftHead === 'o') relation = make(A, B, 'aggregation', false);
      else if (rightHead === 'o') relation = make(B, A, 'aggregation', true);
      else if (rightHead === '>') relation = make(A, B, dotted ? 'dependency' : 'association', false);
      else if (leftHead === '<') relation = make(B, A, dotted ? 'dependency' : 'association', true);
      else relation = make(A, B, dotted ? 'dashedLink' : 'link', false);
      model.relations.push(relation);
      continue;
    }
    if ((m = new RegExp(String.raw`^(${NAME})\s*:\s*(.+)$`).exec(text))) {
      const member = parseMember(m[2]);
      if (member) node(m[1]).members.push(member);
      continue;
    }
    warn(line, text);
  }
  return model;
}

const ARROWS: Record<ClassRelationType, { arrow: string; reverse: boolean }> = {
  // Written parent-first, the way PlantUML class diagrams are conventionally read.
  inheritance: { arrow: '<|--', reverse: true },
  realization: { arrow: '<|..', reverse: true },
  composition: { arrow: '*--', reverse: false },
  aggregation: { arrow: 'o--', reverse: false },
  association: { arrow: '-->', reverse: false },
  dependency: { arrow: '..>', reverse: false },
  link: { arrow: '--', reverse: false },
  dashedLink: { arrow: '..', reverse: false },
};

function memberText(member: ClassMember): string {
  return `${member.visibility ? VISIBILITY_CHAR[member.visibility] : ''}${member.static ? '{static} ' : ''}${member.abstract ? '{abstract} ' : ''}${member.text}`;
}

export function generateClass(model: ClassModel): string {
  const out = ['@startuml'];
  if (model.title) out.push(`title ${encodeText(model.title)}`);
  const ref = (id: string) => quoteIfNeeded(id);

  const emitNode = (n: ClassNode, indent: string) => {
    const keyword = n.kind === 'abstract' ? 'abstract class' : n.kind;
    const name = n.label && n.label !== n.id ? `"${encodeText(n.label)}" as ${ref(n.id)}` : ref(n.id);
    const generic = n.generic ? `<${n.generic}>` : '';
    const stereotype = n.stereotype && n.stereotype.toLowerCase() !== n.kind ? ` <<${n.stereotype}>>` : '';
    const head = `${indent}${keyword} ${name}${generic}${stereotype}`;
    if (n.members.length === 0) out.push(head);
    else out.push(`${head} {`, ...n.members.map((mb) => `${indent}  ${memberText(mb)}`), `${indent}}`);
  };

  const namespaces = [...new Set(model.classes.map((c) => c.namespace).filter((n): n is string => !!n))];
  for (const n of model.classes.filter((c) => !c.namespace)) emitNode(n, '');
  for (const ns of namespaces) {
    out.push(`package ${quoteIfNeeded(ns)} {`);
    for (const n of model.classes.filter((c) => c.namespace === ns)) emitNode(n, '  ');
    out.push('}');
  }
  if (model.relations.length) out.push('');
  for (const r of model.relations) {
    const { arrow, reverse } = ARROWS[r.type];
    const left = reverse ? r.to : r.from;
    const right = reverse ? r.from : r.to;
    const leftCard = reverse ? r.toCardinality : r.fromCardinality;
    const rightCard = reverse ? r.fromCardinality : r.toCardinality;
    out.push(
      `${ref(left)} ${leftCard ? `"${leftCard}" ` : ''}${arrow} ${rightCard ? `"${rightCard}" ` : ''}${ref(right)}${r.label ? ` : ${encodeText(r.label)}` : ''}`,
    );
  }
  for (const note of model.notes) {
    const where = note.target ? `note right of ${ref(note.target)}` : 'note as N' + (model.notes.indexOf(note) + 1);
    out.push(where, ...note.text.split('\n').map((l) => `  ${l}`), 'end note');
  }
  out.push('@enduml');
  return out.join('\n') + '\n';
}

export function classMapper(warning: (line: number, text: string) => string): ModelMapper<ClassModel> {
  return {
    languageId: 'plantuml',
    diagramType: 'class',
    parse(source) {
      const warnings: string[] = [];
      const model = parseClass(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateClass,
  };
}
