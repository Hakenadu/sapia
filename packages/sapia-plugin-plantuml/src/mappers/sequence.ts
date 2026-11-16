import type {
  ModelMapper,
  SequenceBlock,
  SequenceBlockKind,
  SequenceElement,
  SequenceMessage,
  SequenceModel,
  SequenceParticipant,
  SequenceParticipantType,
} from '@sapia/core';
import { contentLines, decodeText, encodeText, quoteIfNeeded, unquote } from './util';
import type { Warn } from './util';

const NAME = String.raw`"[^"]+"|[\w.@]+`;
const DECL = new RegExp(
  String.raw`^(participant|actor|boundary|control|entity|database|collections|queue)\s+(${NAME})(?:\s+as\s+(${NAME}))?`,
  'i',
);
const MESSAGE = new RegExp(
  String.raw`^(${NAME})\s*([<ox]{0,2}-{1,2}(?:\[[^\]]*\])?-?(?:>{1,2}|[\\/]{1,2})?[ox]?)\s*(${NAME})\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.*))?$`,
);
const BLOCK = /^(alt|opt|loop|par|critical|break|group)\b\s*(.*)$/i;
const NOTE = new RegExp(String.raw`^[rh]?note\s+(left|right|over)(?:\s+of)?\s*((?:${NAME})(?:\s*,\s*(?:${NAME}))*)?\s*(?:#\w+\s*)?(?::\s*(.*))?$`, 'i');

interface Frame {
  elements: SequenceElement[];
  block?: SequenceBlock;
}

export function parseSequence(source: string, warn: Warn): SequenceModel {
  const model: SequenceModel = { kind: 'sequence', participants: [], elements: [] };
  const known = new Map<string, SequenceParticipant>();
  const stack: Frame[] = [{ elements: model.elements }];
  let lastMessage: SequenceMessage | null = null;
  const callStack: { from: string; to: string }[] = [];

  const participant = (token: string): string => {
    const id = unquote(token);
    if (!known.has(id)) {
      const p: SequenceParticipant = { id, type: 'participant' };
      known.set(id, p);
      model.participants.push(p);
    }
    return id;
  };
  const push = (el: SequenceElement) => stack[stack.length - 1].elements.push(el);

  const lines = contentLines(source);
  for (let i = 0; i < lines.length; i++) {
    const { text, line } = lines[i];
    let m: RegExpExecArray | null;

    if ((m = /^title\s+(.*)$/i.exec(text))) {
      model.title = decodeText(m[1]);
      continue;
    }
    if (/^autonumber\b/i.test(text)) {
      model.autonumber = true;
      continue;
    }
    if ((m = DECL.exec(text))) {
      const type = m[1].toLowerCase() as SequenceParticipantType;
      const first = m[2];
      const second = m[3];
      let id = unquote(first);
      let label: string | undefined;
      if (second) {
        const firstIsLabel = first.startsWith('"') || !second.startsWith('"');
        id = unquote(firstIsLabel ? second : first);
        label = decodeText(unquote(firstIsLabel ? first : second));
      }
      const existing = known.get(id);
      if (existing) Object.assign(existing, { type, label });
      else {
        const p: SequenceParticipant = { id, type, label };
        known.set(id, p);
        model.participants.push(p);
      }
      continue;
    }
    if ((m = BLOCK.exec(text))) {
      const block: SequenceBlock = {
        type: 'block',
        kind: m[1].toLowerCase() as SequenceBlockKind,
        branches: [{ label: m[2].trim() || undefined, elements: [] }],
      };
      push(block);
      stack.push({ elements: block.branches[0].elements, block });
      continue;
    }
    if ((m = /^else\b\s*(.*)$/i.exec(text))) {
      const frame = stack[stack.length - 1];
      if (!frame.block) {
        warn(line, text);
        continue;
      }
      const branch = { label: m[1].trim() || undefined, elements: [] as SequenceElement[] };
      frame.block.branches.push(branch);
      frame.elements = branch.elements;
      continue;
    }
    if (/^end$/i.test(text)) {
      if (stack.length > 1) stack.pop();
      else warn(line, text);
      continue;
    }
    if ((m = /^(activate|deactivate|destroy)\s+(\S+|"[^"]+")/i.exec(text))) {
      push({ type: m[1].toLowerCase() as 'activate' | 'deactivate' | 'destroy', participant: participant(m[2]) });
      continue;
    }
    if ((m = /^==\s*(.*?)\s*==$/.exec(text))) {
      push({ type: 'divider', text: m[1] });
      continue;
    }
    if ((m = NOTE.exec(text))) {
      const position = m[1].toLowerCase() as 'left' | 'right' | 'over';
      let participants = m[2] ? m[2].split(',').map((p) => participant(p.trim())) : [];
      if (participants.length === 0 && lastMessage) participants = [position === 'left' ? lastMessage.from : lastMessage.to];
      let noteText = m[3];
      if (noteText === undefined) {
        const collected: string[] = [];
        while (++i < lines.length && !/^end\s*[rh]?note$/i.test(lines[i].text)) collected.push(lines[i].text);
        noteText = collected.join('\n');
      }
      if (participants.length === 0) warn(line, text);
      else push({ type: 'note', position, participants, text: decodeText(noteText) });
      continue;
    }
    if ((m = /^return\b\s*(.*)$/i.exec(text))) {
      const call = callStack.pop() ?? (lastMessage ? { from: lastMessage.from, to: lastMessage.to } : null);
      if (!call) {
        warn(line, text);
        continue;
      }
      push({ type: 'message', from: call.to, to: call.from, text: decodeText(m[1]) || undefined, line: 'dotted', arrow: 'filled', deactivate: true });
      continue;
    }
    if ((m = MESSAGE.exec(text))) {
      const arrow = m[2];
      const reversed = arrow.startsWith('<') && !arrow.endsWith('>');
      const dotted = /--/.test(arrow.replace(/\[[^\]]*\]/, ''));
      const head = reversed ? arrow.replace(/-.*$/, '') : arrow.replace(/^.*-/, '');
      let kind: SequenceMessage['arrow'] = 'filled';
      if (/x/.test(head)) kind = 'cross';
      else if (/>>|<<|[\\/]/.test(head)) kind = 'open';
      else if (!/[<>]/.test(head)) kind = 'none';
      const a = participant(m[1]);
      const b = participant(m[3]);
      const message: SequenceMessage = {
        type: 'message',
        from: reversed ? b : a,
        to: reversed ? a : b,
        text: m[5] ? decodeText(m[5]) : undefined,
        line: dotted ? 'dotted' : 'solid',
        arrow: kind,
      };
      if (m[4] === '++') {
        message.activate = true;
        callStack.push({ from: message.from, to: message.to });
      } else if (m[4] === '--') message.deactivate = true;
      push(message);
      lastMessage = message;
      continue;
    }
    if (/^(\.\.\.|\|\|\|?|\|\|\d+\|\||newpage|box\b|end box|ref\b|create\b)/i.test(text)) {
      if (/^create\s+/i.test(text)) {
        const c = /^create\s+(?:\w+\s+)?(\S+)$/i.exec(text);
        if (c) participant(c[1]);
      }
      continue;
    }
    warn(line, text);
  }
  return model;
}

const HEADS: Record<SequenceMessage['arrow'], string> = { filled: '>', open: '>>', cross: '>x', none: '>' };

function emit(elements: SequenceElement[], out: string[], indent: string, ref: (id: string) => string): void {
  for (const el of elements) {
    switch (el.type) {
      case 'message': {
        const arrow = `${el.line === 'dotted' ? '--' : '-'}${HEADS[el.arrow]}`;
        const suffix = el.activate ? ' ++' : el.deactivate ? ' --' : '';
        out.push(`${indent}${ref(el.from)} ${arrow} ${ref(el.to)}${suffix}${el.text ? ` : ${encodeText(el.text)}` : ''}`);
        break;
      }
      case 'note': {
        const where = el.position === 'over' ? 'over' : `${el.position} of`;
        const target = el.participants.map(ref).join(', ');
        if (el.text.includes('\n')) {
          out.push(`${indent}note ${where} ${target}`, ...el.text.split('\n').map((l) => `${indent}  ${l}`), `${indent}end note`);
        } else out.push(`${indent}note ${where} ${target} : ${el.text}`);
        break;
      }
      case 'block':
        el.branches.forEach((branch, i) => {
          out.push(`${indent}${i === 0 ? el.kind : 'else'}${branch.label ? ` ${branch.label}` : ''}`);
          emit(branch.elements, out, `${indent}  `, ref);
        });
        out.push(`${indent}end`);
        break;
      case 'activate':
      case 'deactivate':
      case 'destroy':
        out.push(`${indent}${el.type} ${ref(el.participant)}`);
        break;
      case 'divider':
        out.push(`${indent}== ${el.text} ==`);
        break;
    }
  }
}

export function generateSequence(model: SequenceModel): string {
  const out = ['@startuml'];
  if (model.title) out.push(`title ${encodeText(model.title)}`);
  if (model.autonumber) out.push('autonumber');
  const ref = (id: string) => quoteIfNeeded(id);
  for (const p of model.participants) {
    if (p.label && p.label !== p.id) out.push(`${p.type} "${encodeText(p.label)}" as ${ref(p.id)}`);
    else out.push(`${p.type} ${ref(p.id)}`);
  }
  if (model.participants.length && model.elements.length) out.push('');
  emit(model.elements, out, '', ref);
  out.push('@enduml');
  return out.join('\n') + '\n';
}

export function sequenceMapper(warning: (line: number, text: string) => string): ModelMapper<SequenceModel> {
  return {
    languageId: 'plantuml',
    diagramType: 'sequence',
    parse(source) {
      const warnings: string[] = [];
      const model = parseSequence(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateSequence,
  };
}
