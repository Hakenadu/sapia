import { snippetCompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { Tag } from '@lezer/highlight';
import type { CompletionItem, LanguageSupport, Token, TokenType } from '@sapia/core';

/** One highlight tag per Sapia token type. */
const TAGS: Record<TokenType, Tag> = {
  keyword: Tag.define(),
  controlKeyword: Tag.define(),
  definitionKeyword: Tag.define(),
  type: Tag.define(),
  name: Tag.define(),
  definition: Tag.define(),
  string: Tag.define(),
  number: Tag.define(),
  comment: Tag.define(),
  operator: Tag.define(),
  arrow: Tag.define(),
  punctuation: Tag.define(),
  bracket: Tag.define(),
  meta: Tag.define(),
  tag: Tag.define(),
  label: Tag.define(),
  color: Tag.define(),
  heading: Tag.define(),
  invalid: Tag.define(),
};

/** Colours come from CSS variables, so the same style serves light and dark mode. */
export const sapiaHighlighting: Extension = syntaxHighlighting(
  HighlightStyle.define([
    { tag: TAGS.keyword, color: 'var(--tok-keyword)' },
    { tag: TAGS.controlKeyword, color: 'var(--tok-control)', fontWeight: '550' },
    { tag: TAGS.definitionKeyword, color: 'var(--tok-definition-keyword)', fontWeight: '600' },
    { tag: TAGS.type, color: 'var(--tok-type)' },
    { tag: TAGS.name, color: 'var(--tok-name)' },
    { tag: TAGS.definition, color: 'var(--tok-definition)', fontWeight: '550' },
    { tag: TAGS.string, color: 'var(--tok-string)' },
    { tag: TAGS.number, color: 'var(--tok-number)' },
    { tag: TAGS.comment, color: 'var(--tok-comment)', fontStyle: 'italic' },
    { tag: TAGS.operator, color: 'var(--tok-operator)' },
    { tag: TAGS.arrow, color: 'var(--tok-arrow)', fontWeight: '600' },
    { tag: TAGS.punctuation, color: 'var(--tok-punctuation)' },
    { tag: TAGS.bracket, color: 'var(--tok-punctuation)' },
    { tag: TAGS.meta, color: 'var(--tok-meta)', fontWeight: '550' },
    { tag: TAGS.tag, color: 'var(--tok-tag)' },
    { tag: TAGS.label, color: 'var(--tok-label)' },
    { tag: TAGS.color, color: 'var(--tok-color)' },
    { tag: TAGS.heading, color: 'var(--tok-heading)', fontWeight: '600' },
    { tag: TAGS.invalid, color: 'var(--danger)', textDecoration: 'underline wavy' },
  ]),
);

interface AdapterState {
  inner: unknown;
  tokens: Token[];
  index: number;
}

/** Wraps a Sapia line tokenizer as a CodeMirror stream language. */
export function toCodeMirrorLanguage(language: LanguageSupport): Extension {
  const tokenizer = language.tokenizer;
  if (!tokenizer) return [];
  const parser: StreamParser<AdapterState> = {
    name: language.id,
    startState: () => ({ inner: tokenizer.startState(), tokens: [], index: 0 }),
    copyState: (state) => ({ inner: state.inner, tokens: state.tokens, index: state.index }),
    blankLine(state) {
      state.inner = tokenizer.tokenizeLine('', state.inner).state;
    },
    token(stream, state) {
      if (stream.sol()) {
        const result = tokenizer.tokenizeLine(stream.string, state.inner);
        state.inner = result.state;
        state.tokens = result.tokens;
        state.index = 0;
      }
      while (state.index < state.tokens.length && state.tokens[state.index].to <= stream.pos) state.index++;
      const next = state.tokens[state.index];
      if (!next) {
        stream.skipToEnd();
        return null;
      }
      if (next.from > stream.pos) {
        stream.pos = next.from;
        return null;
      }
      stream.pos = next.to;
      state.index++;
      return next.type;
    },
    languageData: language.lineComment ? { commentTokens: { line: language.lineComment } } : {},
    tokenTable: TAGS,
  };
  return StreamLanguage.define(parser);
}

function toCompletion(item: CompletionItem): Completion {
  const base: Completion = {
    label: item.label,
    type: item.kind,
    detail: item.detail,
    info: item.info,
    boost: item.boost,
  };
  if (item.snippet) return snippetCompletion(item.snippet, base);
  return item.insertText !== undefined ? { ...base, apply: item.insertText } : base;
}

/** Completion source backed by the language's context-aware `complete`. */
export function completionSource(language: () => LanguageSupport | undefined, diagramType: () => string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const lang = language();
    if (!lang?.complete) return null;
    const result = await lang.complete({
      source: context.state.doc.toString(),
      offset: context.pos,
      diagramType: diagramType(),
      explicit: context.explicit,
    });
    if (!result || result.items.length === 0 || context.aborted) return null;
    return { from: result.from, to: result.to, options: result.items.map(toCompletion), filter: true };
  };
}
