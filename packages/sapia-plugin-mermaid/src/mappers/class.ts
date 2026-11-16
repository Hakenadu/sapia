import { toIdentifier } from '@sapia/core';
import type { ClassMember, ClassModel, ClassNode, ClassNodeKind, ClassRelation, ClassRelationType, ModelMapper, Visibility } from '@sapia/core';
import { contentLines, decodeText, encodeQuoted, encodeText } from './util';
import type { Warn } from './util';

const ID = String.raw`\w+(?:[-.]\w+)*`;
const RELATION = new RegExp(
  String.raw`^(${ID})(?:~[^~]+~)?\s*(?:"([^"]*)"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--|\.\.)\s*(?:"([^"]*)"\s*)?(${ID})(?:~[^~]+~)?\s*(?::\s*(.*))?$`,
);
const VISIBILITY: Record<string, Visibility> = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
const VISIBILITY_CHAR: Record<Visibility, string> = { public: '+', private: '-', protected: '#', package: '~' };

const KIND_BY_ANNOTATION: Record<string, ClassNodeKind> = { interface: 'interface', abstract: 'abstract', enumeration: 'enum', enum: 'enum' };

/** Parses a Mermaid member into the neutral `name(args): Type` / `name: Type` form. */
export function parseMember(raw: string): ClassMember | null {
  let text = raw.trim();
  if (!text) return null;
  const member: ClassMember = { text: '', isMethod: false };
  if (VISIBILITY[text[0]] && text.length > 1 && !/^~\w+~/.test(text)) {
    member.visibility = VISIBILITY[text[0]];
    text = text.slice(1).trimStart();
  }
  const method = /^(.*\))\s*([$*])?\s*([^$*]*?)\s*([$*])?$/.exec(text);
  if (method && text.includes('(')) {
    member.isMethod = true;
    const classifier = method[2] ?? method[4];
    if (classifier === '$') member.static = true;
    if (classifier === '*') member.abstract = true;
    const returns = method[3].trim().replace(/^:\s*/, '');
    member.text = returns ? `${method[1]}: ${generics(returns)}` : method[1];
  } else {
    if (text.endsWith('$')) {
      member.static = true;
      text = text.slice(0, -1).trimEnd();
    }
    member.text = generics(text);
  }
  return member.text ? member : null;
}

/** `List~String~` → `List<String>` */
const generics = (text: string): string => {
  let out = text;
  while (/~([^~]*)~/.test(out)) out = out.replace(/~([^~]*)~/, '<$1>');
  return out;
};
/** `List<String>` → `List~String~` */
const mermaidGenerics = (text: string): string => text.replace(/[<>]/g, '~');

export function parseClass(source: string, warn: Warn): ClassModel {
  const { lines, title } = contentLines(source);
  const model: ClassModel = { kind: 'class', title, classes: [], relations: [], notes: [] };
  const byId = new Map<string, ClassNode>();
  let namespace: string | undefined;

  const node = (id: string): ClassNode => {
    let n = byId.get(id);
    if (!n) {
      n = { id, kind: 'class', members: [], namespace };
      byId.set(id, n);
      model.classes.push(n);
    }
    return n;
  };
  const annotate = (n: ClassNode, annotation: string) => {
    const kind = KIND_BY_ANNOTATION[annotation.toLowerCase()];
    if (kind) n.kind = kind;
    else n.stereotype = annotation;
  };

  for (let i = 0; i < lines.length; i++) {
    const { text, line } = lines[i];
    let m: RegExpExecArray | null;
    if ((m = /^title:?\s+(.*)$/i.exec(text))) {
      model.title = decodeText(m[1]);
      continue;
    }
    if (/^direction\s+\w+$/.test(text)) continue;
    if ((m = /^namespace\s+(\w+(?:[-.]\w+)*)\s*\{$/.exec(text))) {
      namespace = m[1];
      continue;
    }
    if (text === '}') {
      namespace = undefined;
      continue;
    }
    if ((m = /^class\s+(\w+(?:[-.]\w+)*)(?:~([^~]+)~)?(?:\s*\["([^"]*)"\])?\s*(?:<<\s*([^>]+?)\s*>>)?\s*(?::::?[\w-]+\s*)?(\{)?\s*(\})?$/.exec(text))) {
      const n = node(m[1]);
      if (m[2]) n.generic = m[2];
      if (m[3]) n.label = decodeText(m[3]);
      if (m[4]) annotate(n, m[4]);
      if (m[5] && !m[6]) {
        while (++i < lines.length && lines[i].text !== '}') {
          const inner = lines[i].text;
          const annotation = /^<<\s*([^>]+?)\s*>>$/.exec(inner);
          if (annotation) annotate(n, annotation[1]);
          else {
            const member = parseMember(inner);
            if (member) n.members.push(member);
          }
        }
      }
      continue;
    }
    if ((m = /^<<\s*([^>]+?)\s*>>\s+(\w+(?:[-.]\w+)*)$/.exec(text))) {
      annotate(node(m[2]), m[1]);
      continue;
    }
    if ((m = /^note\s+for\s+(\w+(?:[-.]\w+)*)\s+"(.*)"$/.exec(text))) {
      model.notes.push({ target: node(m[1]).id, text: decodeText(m[2].replace(/\\n/g, '\n')) });
      continue;
    }
    if ((m = /^note\s+"(.*)"$/.exec(text))) {
      model.notes.push({ text: decodeText(m[1].replace(/\\n/g, '\n')) });
      continue;
    }
    if ((m = RELATION.exec(text))) {
      const [, a, cardA, arrow, cardB, b, label] = m;
      const A = node(a).id;
      const B = node(b).id;
      const dotted = arrow.includes('..');
      const make = (from: string, to: string, type: ClassRelationType, flip: boolean): ClassRelation => ({
        from,
        to,
        type,
        label: label ? decodeText(label) : undefined,
        fromCardinality: (flip ? cardB : cardA) || undefined,
        toCardinality: (flip ? cardA : cardB) || undefined,
      });
      let relation: ClassRelation;
      if (arrow.startsWith('<|')) relation = make(B, A, dotted ? 'realization' : 'inheritance', true);
      else if (arrow.endsWith('|>')) relation = make(A, B, dotted ? 'realization' : 'inheritance', false);
      else if (arrow.startsWith('*')) relation = make(A, B, 'composition', false);
      else if (arrow.endsWith('*')) relation = make(B, A, 'composition', true);
      else if (arrow.startsWith('o')) relation = make(A, B, 'aggregation', false);
      else if (arrow.endsWith('o')) relation = make(B, A, 'aggregation', true);
      else if (arrow.endsWith('>')) relation = make(A, B, dotted ? 'dependency' : 'association', false);
      else if (arrow.startsWith('<')) relation = make(B, A, dotted ? 'dependency' : 'association', true);
      else relation = make(A, B, dotted ? 'dashedLink' : 'link', false);
      model.relations.push(relation);
      continue;
    }
    if ((m = /^(\w+(?:[-.]\w+)*)\s*:\s*(.+)$/.exec(text))) {
      const member = parseMember(m[2]);
      if (member) node(m[1]).members.push(member);
      continue;
    }
    if (/^(click|link|callback|style|classDef|cssClass|accTitle|accDescr)\b/.test(text)) continue;
    warn(line, text);
  }
  return model;
}

const ARROWS: Record<ClassRelationType, { arrow: string; reverse: boolean }> = {
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
  const visibility = member.visibility ? VISIBILITY_CHAR[member.visibility] : '';
  const suffix = member.static ? '$' : member.abstract ? '*' : '';
  if (member.isMethod) {
    const m = /^(.*\))\s*(?::\s*(.*))?$/.exec(member.text);
    if (m) return `${visibility}${mermaidGenerics(m[1])}${m[2] ? ` ${mermaidGenerics(m[2])}` : ''}${suffix}`;
  }
  return `${visibility}${mermaidGenerics(member.text)}${suffix}`;
}

export function generateClass(model: ClassModel): string {
  const out: string[] = [];
  if (model.title) out.push('---', `title: ${model.title.replace(/\n/g, ' ')}`, '---');
  out.push('classDiagram');
  const taken = new Set<string>();
  const ids = new Map<string, string>();
  for (const c of model.classes) ids.set(c.id, toIdentifier(c.id, taken, 'C'));
  const ref = (id: string) => ids.get(id) ?? toIdentifier(id, undefined, 'C');

  const emitNode = (n: ClassNode, indent: string) => {
    const id = ref(n.id);
    const label = n.label ?? (id !== n.id ? n.id : undefined);
    const annotation = n.kind === 'interface' ? 'interface' : n.kind === 'abstract' ? 'abstract' : n.kind === 'enum' ? 'enumeration' : n.stereotype;
    const head = `${indent}class ${id}${n.generic ? `~${n.generic}~` : ''}${label ? `["${encodeQuoted(label)}"]` : ''}`;
    const body = [...(annotation ? [`<<${annotation}>>`] : []), ...n.members.map(memberText)];
    if (body.length === 0) out.push(head);
    else out.push(`${head} {`, ...body.map((l) => `${indent}  ${l}`), `${indent}}`);
  };

  const namespaces = [...new Set(model.classes.map((c) => c.namespace).filter((n): n is string => !!n))];
  for (const n of model.classes.filter((c) => !c.namespace)) emitNode(n, '  ');
  for (const ns of namespaces) {
    out.push(`  namespace ${toIdentifier(ns, undefined, 'ns')} {`);
    for (const n of model.classes.filter((c) => c.namespace === ns)) emitNode(n, '    ');
    out.push('  }');
  }
  for (const r of model.relations) {
    const { arrow, reverse } = ARROWS[r.type];
    const left = reverse ? r.to : r.from;
    const right = reverse ? r.from : r.to;
    const leftCard = reverse ? r.toCardinality : r.fromCardinality;
    const rightCard = reverse ? r.fromCardinality : r.toCardinality;
    out.push(
      `  ${ref(left)} ${leftCard ? `"${leftCard}" ` : ''}${arrow} ${rightCard ? `"${rightCard}" ` : ''}${ref(right)}${r.label ? ` : ${encodeText(r.label)}` : ''}`,
    );
  }
  for (const note of model.notes) {
    const text = note.text.replace(/\n/g, '\\n').replace(/"/g, "'");
    out.push(note.target ? `  note for ${ref(note.target)} "${text}"` : `  note "${text}"`);
  }
  return out.join('\n') + '\n';
}

export function classMapper(warning: (line: number, text: string) => string): ModelMapper<ClassModel> {
  return {
    languageId: 'mermaid',
    diagramType: 'class',
    parse(source) {
      const warnings: string[] = [];
      const model = parseClass(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateClass,
  };
}
