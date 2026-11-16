import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, untracked } from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import type { Diagnostic, EditorConfig, LanguageSupport, TextRange } from '@sapia/core';
import { completionSource, sapiaHighlighting, toCodeMirrorLanguage } from './cm-language';
import { sapiaEditorTheme } from './cm-theme';

/** CodeMirror 6 editor driven by a Sapia {@link LanguageSupport}. */
@Component({
  selector: 'sapia-code-editor',
  template: '',
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeEditor implements OnDestroy {
  readonly value = input.required<string>();
  readonly language = input<LanguageSupport | undefined>();
  readonly diagramType = input('unknown');
  readonly diagnostics = input<Diagnostic[]>([]);
  readonly config = input.required<EditorConfig>();
  readonly placeholder = input('');
  /** Select and scroll to this range whenever it changes. */
  readonly reveal = input<{ range: TextRange; nonce: number } | null>(null);

  readonly valueChange = output<string>();
  readonly cursorChange = output<{ line: number; column: number }>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly languageCompartment = new Compartment();
  private readonly configCompartment = new Compartment();
  private readonly placeholderCompartment = new Compartment();
  private readonly view: EditorView;

  constructor() {
    this.view = new EditorView({
      parent: this.host.nativeElement,
      state: EditorState.create({
        doc: '',
        extensions: [
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSelectionMatches(),
          search({ top: true }),
          lintGutter(),
          autocompletion({
            override: [completionSource(() => this.language(), () => this.diagramType())],
            activateOnTyping: true,
            icons: true,
            defaultKeymap: true,
            maxRenderedOptions: 60,
          }),
          keymap.of([
            { key: 'Tab', run: acceptCompletion },
            { key: 'Mod-Space', run: startCompletion },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            ...lintKeymap,
            indentWithTab,
          ]),
          sapiaHighlighting,
          sapiaEditorTheme,
          this.languageCompartment.of([]),
          this.configCompartment.of([]),
          this.placeholderCompartment.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) this.valueChange.emit(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              this.cursorChange.emit({ line: line.number - 1, column: head - line.from });
            }
          }),
        ],
      }),
    });

    // External changes (open, convert, AI edits) go through a transaction so undo keeps working.
    effect(() => {
      const value = this.value();
      const current = this.view.state.doc.toString();
      if (value === current) return;
      // Replace only the changed middle part to keep the cursor and scroll position stable.
      let start = 0;
      const max = Math.min(value.length, current.length);
      while (start < max && value.charCodeAt(start) === current.charCodeAt(start)) start++;
      let endA = current.length;
      let endB = value.length;
      while (endA > start && endB > start && current.charCodeAt(endA - 1) === value.charCodeAt(endB - 1)) {
        endA--;
        endB--;
      }
      this.view.dispatch({ changes: { from: start, to: endA, insert: value.slice(start, endB) } });
    });

    effect(() => {
      const language = this.language();
      this.view.dispatch({ effects: this.languageCompartment.reconfigure(language ? toCodeMirrorLanguage(language) : []) });
    });

    effect(() => {
      const config = this.config();
      this.view.dispatch({
        effects: this.configCompartment.reconfigure([
          config.lineNumbers ? lineNumbers() : [],
          config.wordWrap ? EditorView.lineWrapping : [],
          EditorState.tabSize.of(config.tabSize),
          indentUnit.of(' '.repeat(config.tabSize)),
          EditorView.theme({ '&': { fontSize: `${config.fontSize}px` } }),
        ]),
      });
    });

    effect(() => {
      const text = this.placeholder();
      this.view.dispatch({ effects: this.placeholderCompartment.reconfigure(text ? placeholder(text) : []) });
    });

    effect(() => {
      const diagnostics = this.diagnostics();
      this.value();
      untracked(() => {
        const length = this.view.state.doc.length;
        const mapped: CmDiagnostic[] = diagnostics.map((d) => {
          const from = Math.max(0, Math.min(d.from, length));
          const to = Math.max(from, Math.min(d.to, length));
          return { from, to, severity: d.severity, message: d.message, source: d.source };
        });
        this.view.dispatch(setDiagnostics(this.view.state, mapped));
      });
    });

    effect(() => {
      const reveal = this.reveal();
      if (!reveal) return;
      untracked(() => this.select(reveal.range));
    });
  }

  select(range: TextRange): void {
    const length = this.view.state.doc.length;
    const from = Math.max(0, Math.min(range.from, length));
    const to = Math.max(from, Math.min(range.to, length));
    this.view.dispatch({
      selection: EditorSelection.range(from, to),
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    this.view.focus();
    // Briefly flash the line so the eye finds the target.
    const line = this.view.domAtPos(from).node;
    const element = (line instanceof HTMLElement ? line : line.parentElement)?.closest('.cm-line');
    element?.animate([{ background: 'var(--primary-soft)' }, { background: 'transparent' }], { duration: 900, easing: 'ease-out' });
  }

  focus(): void {
    this.view.focus();
  }

  ngOnDestroy(): void {
    this.view.destroy();
  }
}
