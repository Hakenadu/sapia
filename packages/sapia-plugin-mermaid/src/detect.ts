import type { DetectionResult } from '@sapia/core';
import { DiagramTypes } from '@sapia/core';

/** Header keyword (first statement of a Mermaid diagram) → diagram type. */
export const HEADERS: [RegExp, string][] = [
  [/^sequenceDiagram\b/, DiagramTypes.sequence],
  [/^classDiagram(-v2)?\b/, DiagramTypes.class],
  [/^stateDiagram(-v2)?\b/, DiagramTypes.state],
  [/^erDiagram\b/, DiagramTypes.er],
  [/^(flowchart|graph)(-elk)?\b/, DiagramTypes.flowchart],
  [/^gantt\b/, DiagramTypes.gantt],
  [/^pie\b/, DiagramTypes.pie],
  [/^journey\b/, DiagramTypes.journey],
  [/^gitGraph\b/, DiagramTypes.gitgraph],
  [/^mindmap\b/, DiagramTypes.mindmap],
  [/^timeline\b/, DiagramTypes.timeline],
  [/^quadrantChart\b/, DiagramTypes.quadrant],
  [/^requirementDiagram\b/, DiagramTypes.requirement],
  [/^C4(Context|Container|Component|Dynamic|Deployment)\b/, DiagramTypes.c4],
  [/^sankey(-beta)?\b/, DiagramTypes.sankey],
  [/^xychart(-beta)?\b/, DiagramTypes.xychart],
  [/^block(-beta)?\b/, DiagramTypes.block],
  [/^architecture(-beta)?\b/, DiagramTypes.architecture],
  [/^kanban\b/, DiagramTypes.kanban],
  [/^packet(-beta)?\b/, DiagramTypes.packet],
];

export interface MermaidPreamble {
  /** Zero-based line of the header statement, or -1 when there is none. */
  headerLine: number;
  header: string;
  diagramType: string;
}

/** Skips front matter, directives and comments and reads the header line. */
export function readPreamble(source: string): MermaidPreamble {
  const lines = source.split(/\r\n|\r|\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() === '---') {
    i++;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }
  let inDirective = false;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (inDirective) {
      if (line.includes('}%%')) inDirective = false;
      continue;
    }
    if (!line) continue;
    if (line.startsWith('%%{')) {
      inDirective = !line.includes('}%%');
      continue;
    }
    if (line.startsWith('%%')) continue;
    for (const [re, type] of HEADERS) {
      if (re.test(line)) return { headerLine: i, header: line, diagramType: type };
    }
    return { headerLine: -1, header: line, diagramType: DiagramTypes.unknown };
  }
  return { headerLine: -1, header: '', diagramType: DiagramTypes.unknown };
}

export function detectMermaid(source: string): DetectionResult | null {
  if (/^\s*@start\w+/m.test(source)) return null;
  const preamble = readPreamble(source);
  if (preamble.headerLine >= 0) return { confidence: 0.97, diagramType: preamble.diagramType };
  // Front matter or an init directive without a recognised header still looks like Mermaid.
  if (/^\s*%%\{\s*init\s*:/m.test(source)) return { confidence: 0.6, diagramType: DiagramTypes.unknown };
  return null;
}
