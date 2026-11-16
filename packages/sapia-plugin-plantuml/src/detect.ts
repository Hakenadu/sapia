import type { DetectionResult } from '@sapia/core';
import { DiagramTypes } from '@sapia/core';

const START_TAG_TYPES: Record<string, string> = {
  mindmap: DiagramTypes.mindmap,
  wbs: DiagramTypes.wbs,
  gantt: DiagramTypes.gantt,
  json: DiagramTypes.json,
  yaml: DiagramTypes.yaml,
  salt: DiagramTypes.salt,
  chen: DiagramTypes.er,
};

const ENTITY = String.raw`(?:"[^"]+"|[\w.@:]+)`;
const ARROW = String.raw`[<ox*#|\\/]*[-.=~]+(?:\[[^\]]*\])?(?:up|down|left|right|[udlr])?[-.=~]*[>ox*#|\\/]*`;

interface Rule {
  type: string;
  re: RegExp;
  weight: number;
}

/** Line patterns that hint at a diagram type. Scores are summed per type. */
const RULES: Rule[] = [
  { type: 'sequence', re: /^(participant|boundary|control|collections|queue)\s/i, weight: 4 },
  { type: 'sequence', re: /^(actor|database|entity)\s+\S+\s*$/i, weight: 1 },
  { type: 'sequence', re: new RegExp(String.raw`^${ENTITY}\s*<?-{1,2}>{1,2}[ox]?\s*${ENTITY}\s*(\+\+|--|\*\*|!!)?\s*:`), weight: 3 },
  { type: 'sequence', re: new RegExp(String.raw`^${ENTITY}\s*<-{1,2}\s*${ENTITY}\s*:`), weight: 3 },
  { type: 'sequence', re: /^(activate|deactivate|destroy|autonumber|return)\b/i, weight: 3 },
  { type: 'sequence', re: /^(alt|opt|loop|par|critical|break|group)\b/i, weight: 2 },
  { type: 'sequence', re: /^==.+==$/, weight: 2 },
  { type: 'sequence', re: /^note\s+over\b/i, weight: 2 },

  { type: 'class', re: /^(abstract\s+class|abstract|class|interface|enum|annotation|struct)\s+\S/i, weight: 4 },
  { type: 'class', re: /<\|(--|\.\.)|(--|\.\.)\|>/, weight: 4 },
  { type: 'class', re: /^\s*[+\-#~]\s*\w+.*\(.*\)/, weight: 2 },
  { type: 'class', re: /\b(extends|implements)\b/, weight: 2 },

  { type: 'state', re: /\[\*\]/, weight: 5 },
  { type: 'state', re: /^state\s+\S/i, weight: 5 },

  { type: 'component', re: /(^|\s)\[[^\]*][^\]]*\]/, weight: 3 },
  { type: 'component', re: /^(component|interface)\s+\S/i, weight: 2 },
  { type: 'component', re: /^\(\)\s*\S/, weight: 3 },
  { type: 'component', re: /^(package|folder|frame|rectangle)\s+.*\{\s*$/i, weight: 1 },

  { type: 'deployment', re: /^(node|artifact|cloud|storage|stack|agent|file)\s+\S/i, weight: 3 },
  { type: 'deployment', re: /^(database|queue)\s+\S+.*\{\s*$/i, weight: 1 },

  { type: 'usecase', re: /^usecase\s+\S/i, weight: 5 },
  { type: 'usecase', re: /(^|\s)\([^()*][^()]*\)(\s|$)/, weight: 3 },
  { type: 'usecase', re: /(^|\s):[^:;]+:(\s|$)/, weight: 3 },
  { type: 'usecase', re: /^actor\s+\S+.*$/i, weight: 1 },

  { type: 'activity', re: /^(start|stop|end|endif|endwhile|fork|end fork|repeat|detach|kill)$/i, weight: 4 },
  { type: 'activity', re: /^:.*[;|<>/\]}]$/, weight: 4 },
  { type: 'activity', re: /^:[^:]*$/, weight: 1 },
  { type: 'activity', re: /^(if|elseif|while|repeat while|switch|case)\s*\(.*\)/i, weight: 4 },
  { type: 'activity', re: /^\|[^|]+\|$/, weight: 3 },
  { type: 'activity', re: /^\(\*\)\s*-+>/, weight: 4 },
  { type: 'activity', re: /^partition\s+/i, weight: 3 },

  { type: 'object', re: /^(object|map)\s+\S/i, weight: 5 },

  { type: 'er', re: /[|}][o|]?(--|\.\.)[o|]?[|{]/, weight: 5 },
  { type: 'er', re: /^entity\s+\S+.*\{\s*$/i, weight: 3 },

  { type: 'timing', re: /^(robust|concise|clock|binary|analog)\s+/i, weight: 5 },
  { type: 'timing', re: /^@\d+/, weight: 3 },

  { type: 'gantt', re: /^\[[^\]]+\]\s+(lasts|starts|ends|requires|happens|is)\b/i, weight: 5 },
  { type: 'gantt', re: /^project starts\b/i, weight: 5 },

  { type: 'salt', re: /^salt$/i, weight: 8 },
  { type: 'mindmap', re: /^[*+-]{1,8}(_|\[#\w+\])?\s+\S/, weight: 1 },
];

const NOISE = /^(skinparam|hide|show|title|header|footer|caption|legend|scale|left to right direction|top to bottom direction|!|'|\/')/i;

/** Guesses the diagram type of a `@startuml` body. */
export function detectPlantUmlType(body: string[]): string {
  const scores = new Map<string, number>();
  let inBlockComment = false;
  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    if (inBlockComment) {
      if (line.includes("'/")) inBlockComment = false;
      continue;
    }
    if (line.startsWith("/'")) {
      inBlockComment = !line.includes("'/");
      continue;
    }
    if (NOISE.test(line)) continue;
    for (const rule of RULES) {
      if (rule.re.test(line)) scores.set(rule.type, (scores.get(rule.type) ?? 0) + rule.weight);
    }
  }
  // A generic arrow between two names counts weakly towards sequence diagrams
  // only when nothing structural was found.
  if (scores.size === 0) {
    const generic = new RegExp(String.raw`^${ENTITY}\s*${ARROW}\s*${ENTITY}`);
    if (body.some((l) => generic.test(l.trim()))) return DiagramTypes.sequence;
    return DiagramTypes.unknown;
  }
  // Mind map markers alone are weak; they only win when unopposed.
  if (scores.size > 1) scores.delete('mindmap');
  // Deployment elements inside a component diagram are still a component diagram.
  if (scores.has('component') && scores.has('deployment')) {
    scores.set('component', scores.get('component')! + scores.get('deployment')!);
    scores.delete('deployment');
  }
  let best = DiagramTypes.unknown as string;
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

const MERMAID_HEADER =
  /^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|flowchart|graph\s+(TB|TD|BT|RL|LR)|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|sankey|xychart|block|architecture|kanban|packet)/;

export function detectPlantUml(source: string): DetectionResult | null {
  const lines = source.split(/\r\n|\r|\n/);
  const startIndex = lines.findIndex((l) => /^\s*@start\w+/.test(l));
  if (startIndex >= 0) {
    const tag = /^\s*@start(\w+)/.exec(lines[startIndex])![1].toLowerCase();
    const endIndex = lines.findIndex((l, i) => i > startIndex && /^\s*@end\w+/.test(l));
    const body = lines.slice(startIndex + 1, endIndex < 0 ? undefined : endIndex);
    const diagramType = START_TAG_TYPES[tag] ?? detectPlantUmlType(body);
    return { confidence: 0.98, diagramType };
  }

  // No start tag: PlantUML tolerates that, so look for characteristic syntax.
  const meaningful = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("'"));
  if (meaningful.length === 0) return null;
  if (MERMAID_HEADER.test(meaningful[0]) || meaningful[0].startsWith('---') || meaningful[0].startsWith('%%')) return null;
  const diagramType = detectPlantUmlType(meaningful);
  if (diagramType === DiagramTypes.unknown) {
    return /^(skinparam|!theme|!include|!define)\b/m.test(source) ? { confidence: 0.5, diagramType } : null;
  }
  return { confidence: 0.45, diagramType };
}
