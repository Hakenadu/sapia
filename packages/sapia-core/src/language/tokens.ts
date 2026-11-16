/**
 * Semantic token categories. UI layers map these onto their own theme
 * (sapia-web maps them onto CodeMirror highlight tags).
 */
export type TokenType =
  | 'keyword'
  | 'controlKeyword'
  | 'definitionKeyword'
  | 'type'
  | 'name'
  | 'definition'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'arrow'
  | 'punctuation'
  | 'bracket'
  | 'meta'
  | 'tag'
  | 'label'
  | 'color'
  | 'heading'
  | 'invalid';

export interface Token {
  /** Column where the token starts (inclusive). */
  from: number;
  /** Column where the token ends (exclusive). */
  to: number;
  type: TokenType;
}

/**
 * A line-based, incremental tokenizer. `S` must be a plain, cheaply
 * copyable value (string / number / flat object) because editors snapshot it
 * per line.
 */
export interface Tokenizer<S = unknown> {
  startState(): S;
  tokenizeLine(line: string, state: S): { tokens: Token[]; state: S };
}

/** One rule of a {@link createRuleTokenizer} state. */
export interface TokenRule {
  /** Matched at the current position (the `y` flag is added automatically). */
  match: RegExp;
  /**
   * Token type for the whole match, or one type per capture group (groups
   * must then cover the match contiguously). `null` emits no token.
   */
  token: TokenType | null | (TokenType | null)[];
  /** State to switch to after the match. `@pop` returns to the previous state. */
  next?: string;
  /** Only try this rule at the first non-blank column of the line. */
  lineStart?: boolean;
}

export interface RuleTokenizerSpec {
  /** Name of the initial state. Defaults to `root`. */
  start?: string;
  states: Record<string, TokenRule[]>;
  /** States that only live until the end of the line they were entered on. */
  transient?: string[];
  /**
   * Optional hook to pick a state when a line starts, e.g. to switch grammar
   * after a header line decided the diagram type.
   */
  onLineStart?(line: string, state: string): string | undefined;
}

interface CompiledRule extends TokenRule {
  re: RegExp;
}

/**
 * Builds a {@link Tokenizer} from declarative regex rules, in the spirit of
 * TextMate / Monarch grammars. The tokenizer state is a `>`-joined stack of
 * state names, e.g. `root>blockComment`.
 */
export function createRuleTokenizer(spec: RuleTokenizerSpec): Tokenizer<string> {
  const compiled = new Map<string, CompiledRule[]>();
  for (const [name, rules] of Object.entries(spec.states)) {
    compiled.set(
      name,
      rules.map((r) => ({
        ...r,
        re: new RegExp(r.match.source, [...new Set((r.match.flags + 'y').replace('g', ''))].join('')),
      })),
    );
  }
  const start = spec.start ?? 'root';

  return {
    startState: () => start,
    tokenizeLine(line, state) {
      let stack = state.split('>');
      if (spec.transient) {
        while (stack.length > 1 && spec.transient.includes(stack[stack.length - 1])) stack = stack.slice(0, -1);
      }
      const switched = spec.onLineStart?.(line, stack[stack.length - 1]);
      if (switched) stack = [...stack.slice(0, -1), switched];
      const tokens: Token[] = [];
      const firstCol = line.length - line.trimStart().length;
      let pos = 0;
      outer: while (pos < line.length) {
        const rules = compiled.get(stack[stack.length - 1]) ?? compiled.get(start) ?? [];
        for (const rule of rules) {
          if (rule.lineStart && pos !== firstCol) continue;
          rule.re.lastIndex = pos;
          const m = rule.re.exec(line);
          if (!m || m[0].length === 0) continue;
          if (Array.isArray(rule.token)) {
            let p = pos;
            for (let g = 1; g < m.length; g++) {
              const text = m[g];
              if (text == null || text.length === 0) continue;
              const type = rule.token[g - 1];
              if (type) tokens.push({ from: p, to: p + text.length, type });
              p += text.length;
            }
          } else if (rule.token) {
            tokens.push({ from: pos, to: pos + m[0].length, type: rule.token });
          }
          pos += m[0].length;
          if (rule.next === '@pop') {
            if (stack.length > 1) stack = stack.slice(0, -1);
          } else if (rule.next) {
            stack = [...stack, rule.next];
          }
          continue outer;
        }
        pos++;
      }
      return { tokens, state: stack.join('>') };
    },
  };
}
