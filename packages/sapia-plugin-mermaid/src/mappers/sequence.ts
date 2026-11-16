import { toIdentifier } from '@sapia/core';
import type { ModelMapper, SequenceBlock, SequenceBlockKind, SequenceElement, SequenceMessage, SequenceModel, SequenceParticipant } from '@sapia/core';
import { contentLines, decodeText, encodeText } from './util';
import type { Warn } from './util';

const MESSAGE = /^([^:]+?)\s*(<<-{1,2}>>|-{1,2}>>|-{1,2}[x)]|-{1,2}>)\s*([+-])?\s*([^:]+?)\s*(?::\s*(.*))?$/;
const BLOCKS: Record<string, SequenceBlockKind> = { alt: 'alt', opt: 'opt', loop: 'loop', par: 'par', critical: 'critical', break: 'break', rect: 'group', box: 'group' };

export function parseSequence(source: string, warn: Warn): SequenceModel {
  const { lines, title } = contentLines(source);
  const model: SequenceModel = { kind: 'sequence', title, participants: [], elements: [] };
  const known = new Map<string, SequenceParticipant>();
  const stack: { elements: SequenceElement[]; block?: SequenceBlock; transparent?: boolean }[] = [{ elements: model.elements }];

  const participant = (id: string): string => {
    const key = id.trim();
    if (!known.has(key)) {
      const p: SequenceParticipant = { id: key, type: 'participant' };
      known.set(key, p);
      model.participants.push(p);
    }
    return key;
  };
  const push = (el: SequenceElement) => stack[stack.length - 1].elements.push(el);

  for (const { text, line } of lines) {
    let m: RegExpExecArray | null;
    if ((m = /^title:?\s+(.*)$/i.exec(text))) {
      model.title = decodeText(m[1]);
      continue;
    }
    if (/^autonumber\b/.test(text)) {
      model.autonumber = true;
      continue;
    }
    if ((m = /^(?:create\s+)?(participant|actor)\s+([^\s@]+)(@\{[^}]*\})?(?:\s+as\s+(.+))?$/.exec(text))) {
      const id = participant(m[2]);
      const p = known.get(id)!;
      p.type = m[1] === 'actor' ? 'actor' : 'participant';
      const typed = /"type"\s*:\s*"(\w+)"/.exec(m[3] ?? '')?.[1];
      if (typed && ['actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'].includes(typed)) p.type = typed as SequenceParticipant['type'];
      if (m[4]) p.label = decodeText(m[4]);
      continue;
    }
    if ((m = /^(alt|opt|loop|par|critical|break|rect|box)\b\s*(.*)$/.exec(text))) {
      if (m[1] === 'box') {
        // A box only groups participant declarations.
        stack.push({ elements: stack[stack.length - 1].elements, transparent: true });
        continue;
      }
      const block: SequenceBlock = {
        type: 'block',
        kind: BLOCKS[m[1]],
        branches: [{ label: m[1] === 'rect' ? undefined : m[2].trim() || undefined, elements: [] }],
      };
      push(block);
      stack.push({ elements: block.branches[0].elements, block });
      continue;
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(text))) {
      const frame = stack[stack.length - 1];
      if (!frame.block) {
        warn(line, text);
        continue;
      }
      const branch = { label: m[2].trim() || undefined, elements: [] as SequenceElement[] };
      frame.block.branches.push(branch);
      frame.elements = branch.elements;
      continue;
    }
    if (text === 'end') {
      if (stack.length > 1) stack.pop();
      else warn(line, text);
      continue;
    }
    if ((m = /^(activate|deactivate|destroy)\s+(.+)$/.exec(text))) {
      push({ type: m[1] as 'activate' | 'deactivate' | 'destroy', participant: participant(m[2]) });
      continue;
    }
    if ((m = /^note\s+(right of|left of|over)\s+([^:]+?)\s*:\s*(.*)$/i.exec(text))) {
      const position = m[1].toLowerCase().startsWith('right') ? 'right' : m[1].toLowerCase().startsWith('left') ? 'left' : 'over';
      push({ type: 'note', position, participants: m[2].split(',').map((p) => participant(p)), text: decodeText(m[3]) });
      continue;
    }
    if ((m = MESSAGE.exec(text))) {
      const arrow = m[2];
      const dotted = arrow.includes('--');
      let kind: SequenceMessage['arrow'] = 'filled';
      if (arrow.endsWith('x')) kind = 'cross';
      else if (arrow.endsWith(')')) kind = 'open';
      else if (!arrow.endsWith('>>')) kind = 'none';
      const message: SequenceMessage = {
        type: 'message',
        from: participant(m[1]),
        to: participant(m[4]),
        text: m[5] ? decodeText(m[5]) : undefined,
        line: dotted ? 'dotted' : 'solid',
        arrow: kind,
      };
      if (m[3] === '+') message.activate = true;
      if (m[3] === '-') message.deactivate = true;
      push(message);
      continue;
    }
    if (/^(links?|properties|accTitle|accDescr)\b/.test(text)) continue;
    warn(line, text);
  }
  return model;
}

const ARROWS: Record<SequenceMessage['arrow'], [solid: string, dotted: string]> = {
  filled: ['->>', '-->>'],
  open: ['-)', '--)'],
  cross: ['-x', '--x'],
  none: ['->', '-->'],
};

function emit(elements: SequenceElement[], out: string[], indent: string, ref: (id: string) => string): void {
  for (const el of elements) {
    switch (el.type) {
      case 'message': {
        const arrow = ARROWS[el.arrow][el.line === 'dotted' ? 1 : 0];
        const mark = el.activate ? '+' : el.deactivate ? '-' : '';
        out.push(`${indent}${ref(el.from)}${arrow}${mark}${ref(el.to)}: ${el.text ? encodeText(el.text) : ' '}`.trimEnd());
        break;
      }
      case 'note': {
        const where = el.position === 'over' ? 'over' : `${el.position} of`;
        const targets = el.position === 'over' ? el.participants.slice(0, 2) : el.participants.slice(0, 1);
        out.push(`${indent}Note ${where} ${targets.map(ref).join(',')}: ${encodeText(el.text)}`);
        break;
      }
      case 'block': {
        const kind = el.kind === 'group' ? 'opt' : el.kind;
        const separator = kind === 'par' ? 'and' : kind === 'critical' ? 'option' : 'else';
        el.branches.forEach((branch, i) => {
          out.push(`${indent}${i === 0 ? kind : separator}${branch.label ? ` ${branch.label}` : ''}`);
          emit(branch.elements, out, `${indent}  `, ref);
        });
        out.push(`${indent}end`);
        break;
      }
      case 'activate':
      case 'deactivate':
        out.push(`${indent}${el.type} ${ref(el.participant)}`);
        break;
      case 'destroy':
        // Mermaid needs a message to destroy a participant; deactivation is the closest neutral form.
        break;
      case 'divider':
        out.push(`${indent}Note over ${ref('')}: ${encodeText(el.text)}`);
        break;
    }
  }
}

export function generateSequence(model: SequenceModel): string {
  const out: string[] = [];
  if (model.title) out.push('---', `title: ${model.title.replace(/\n/g, ' ')}`, '---');
  out.push('sequenceDiagram');
  if (model.autonumber) out.push('  autonumber');
  const taken = new Set<string>();
  const ids = new Map<string, string>();
  for (const p of model.participants) ids.set(p.id, toIdentifier(p.id, taken, 'p'));
  const first = model.participants[0] ? ids.get(model.participants[0].id)! : 'A';
  const last = model.participants.length ? ids.get(model.participants[model.participants.length - 1].id)! : first;
  const ref = (id: string) => (id === '' ? (first === last ? first : `${first},${last}`) : (ids.get(id) ?? toIdentifier(id, undefined, 'p')));
  for (const p of model.participants) {
    const id = ids.get(p.id)!;
    const label = p.label ?? (id !== p.id ? p.id : undefined);
    const keyword = p.type === 'actor' ? 'actor' : 'participant';
    const typed = p.type !== 'actor' && p.type !== 'participant' ? `@{ "type": "${p.type}" }` : '';
    out.push(`  ${keyword} ${id}${typed}${label ? ` as ${encodeText(label)}` : ''}`);
  }
  emit(model.elements, out, '  ', ref);
  return out.join('\n') + '\n';
}

export function sequenceMapper(warning: (line: number, text: string) => string): ModelMapper<SequenceModel> {
  return {
    languageId: 'mermaid',
    diagramType: 'sequence',
    parse(source) {
      const warnings: string[] = [];
      const model = parseSequence(source, (line, text) => warnings.push(warning(line, text)));
      return { model, warnings };
    },
    generate: generateSequence,
  };
}
