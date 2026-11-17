import type { Diagnostic } from '../language/language';
import type { ProjectLocationType, ProjectSyncState } from '../project/project';
import type { StoredDiagramMeta } from '../storage/store';

/** JSON Schema (draft-07 subset) describing a tool's input. */
export type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number)[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

export interface DiagramSnapshot {
  id: string | null;
  name: string;
  /** Project the diagram belongs to, or will be saved to once the user saves it. */
  project: { id: string; name: string };
  /** False while the editor holds changes (or a new diagram) the user has not saved yet. */
  saved: boolean;
  source: string;
  languageId: string | null;
  diagramType: string | null;
  diagnostics: AiDiagnostic[];
  /** Languages the diagram can currently be converted to. */
  conversionTargets: string[];
}

export interface AiDiagnostic {
  line: number;
  severity: Diagnostic['severity'];
  message: string;
}

export interface AiProjectSummary {
  id: string;
  name: string;
  description?: string;
  storage: ProjectLocationType;
  /** Where the diagrams live, e.g. a folder or a repository URL. */
  location?: string;
  isDefault: boolean;
  /** The project shown in the library; new diagrams go here. */
  active: boolean;
  diagramCount: number;
  syncState: ProjectSyncState;
}

export interface LanguageCapability {
  id: string;
  name: string;
  diagramTypes: string[];
  /** Diagram types this language can convert from/to (has a metamodel mapper for). */
  convertibleTypes: string[];
}

/**
 * What the assistant may do in the application. The UI implements this
 * against its real state; tools are written against the interface only.
 */
export interface AiWorkspace {
  getActiveDiagram(): Promise<DiagramSnapshot>;
  /** Replaces the source of the open diagram and returns the validated result. */
  setActiveSource(source: string): Promise<DiagramSnapshot>;
  listProjects(): Promise<AiProjectSummary[]>;
  /** Shows a project in the library; new diagrams are saved there. Returns false for unknown ids. */
  setActiveProject(projectId: string): Promise<boolean>;
  /** Saved diagrams of a project (the active project when omitted). */
  listDiagrams(projectId?: string): Promise<StoredDiagramMeta[]>;
  readDiagram(id: string, projectId?: string): Promise<{ name: string; source: string } | null>;
  /**
   * Opens a new, unsaved diagram in the editor and returns the validated
   * result. Only the user saves it.
   */
  createDiagram(input: { name: string; source: string; projectId?: string }): Promise<DiagramSnapshot>;
  openDiagram(id: string, projectId?: string): Promise<DiagramSnapshot | null>;
  /** Renames the diagram in the editor; the new name is stored when the user saves. */
  renameActiveDiagram(name: string): Promise<void>;
  /**
   * Chooses the project an unsaved diagram will be saved to. Throws for
   * diagrams that are already saved: moving those is up to the user.
   */
  setActiveDiagramProject(projectId: string): Promise<DiagramSnapshot>;
  convertActiveDiagram(targetLanguageId: string): Promise<{ snapshot: DiagramSnapshot; warnings: string[] }>;
  /** Detects and validates a source without touching the editor. */
  checkSource(source: string): Promise<Pick<DiagramSnapshot, 'languageId' | 'diagramType' | 'diagnostics'>>;
  listCapabilities(): Promise<LanguageCapability[]>;
  getTemplate(languageId: string, diagramType: string): Promise<string | null>;
}

export interface AiToolContext {
  workspace: AiWorkspace;
}

/** A tool the model can call. Plugins can contribute their own. */
export interface AiTool<I = any> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Whether the tool changes user data (shown differently in the UI). */
  mutating?: boolean;
  execute(input: I, context: AiToolContext): Promise<unknown>;
}

/** Serializable part of a tool, sent to the process that talks to the model. */
export type AiToolSpec = Pick<AiTool, 'name' | 'description' | 'inputSchema' | 'mutating'>;

export function toToolSpec(tool: AiTool): AiToolSpec {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema, mutating: tool.mutating };
}

/** Events streamed from the model backend to the assistant UI. */
export type AiStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; name: string; output: unknown; isError?: boolean }
  | { type: 'error'; message: string }
  | { type: 'finish' };

export interface AiChatRequest {
  /** Conversation id; the backend keeps the full message history per session. */
  sessionId: string;
  /** The new user message. */
  message: string;
  system: string;
  tools: AiToolSpec[];
  /** Provider key from the config; defaults to `ai.provider`. */
  provider?: string;
}

export interface AiChatHandlers {
  onEvent(event: AiStreamEvent): void;
  /** Runs a tool in the UI process and returns its (JSON-serializable) result. */
  executeTool(name: string, input: unknown): Promise<unknown>;
}

/**
 * Connection to a model provider. Implemented by the host (the desktop app
 * runs it in its main process so API keys never reach the UI).
 */
export interface AiBackend {
  chat(request: AiChatRequest, handlers: AiChatHandlers, signal?: AbortSignal): Promise<void>;
  /**
   * Stops the running request of a session. Use this where an `AbortSignal`
   * cannot cross a process boundary (e.g. the desktop preload bridge).
   */
  abort(sessionId: string): Promise<void>;
  /** Drops the stored history of a session. */
  reset(sessionId: string): Promise<void>;
}

const projectId: JsonSchema = {
  type: 'string',
  description: 'Project id from list_projects. Defaults to the active project.',
};

const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

function summarize(snapshot: DiagramSnapshot, includeSource = false) {
  return {
    id: snapshot.id,
    name: snapshot.name,
    project: snapshot.project,
    saved: snapshot.saved,
    language: snapshot.languageId,
    diagramType: snapshot.diagramType,
    diagnostics: snapshot.diagnostics,
    valid: !snapshot.diagnostics.some((d) => d.severity === 'error'),
    conversionTargets: snapshot.conversionTargets,
    ...(includeSource ? { source: snapshot.source } : {}),
  };
}

/** Closing directives that content must be inserted before, per language convention. */
const CLOSING_LINE = /^\s*@end\w+\s*$/;

/** Appends content to a diagram, keeping closing directives such as `@enduml` last. */
export function appendToSource(source: string, content: string): string {
  const lines = source.replace(/\s+$/, '').split('\n');
  const addition = content.replace(/^\n+|\s+$/g, '');
  let end = lines.length;
  while (end > 0 && CLOSING_LINE.test(lines[end - 1])) end--;
  if (end === lines.length) return [...lines, addition].join('\n') + '\n';
  return [...lines.slice(0, end), addition, ...lines.slice(end)].join('\n') + '\n';
}

/** The tools every Sapia installation offers to the assistant. */
export function createCoreAiTools(): AiTool[] {
  return [
    {
      name: 'get_active_diagram',
      description:
        'Returns the diagram currently open in the editor: name, full source, detected language and diagram type, and current syntax diagnostics. Call this before modifying the diagram.',
      inputSchema: object({}),
      execute: async (_input, { workspace }) => summarize(await workspace.getActiveDiagram(), true),
    },
    {
      name: 'replace_diagram_source',
      description:
        'Replaces the entire source of the diagram open in the editor. Returns detected language/type and diagnostics of the new source; fix reported errors with a follow-up call.',
      mutating: true,
      inputSchema: object({ source: { type: 'string', description: 'The complete new diagram source.' } }, ['source']),
      execute: async (input: { source: string }, { workspace }) => summarize(await workspace.setActiveSource(input.source)),
    },
    {
      name: 'edit_diagram',
      description:
        'Applies exact search-and-replace edits to the open diagram. Prefer this over replacing the whole source for small changes. Each `find` must occur exactly once in the current source.',
      mutating: true,
      inputSchema: object(
        {
          edits: {
            type: 'array',
            items: object(
              {
                find: { type: 'string', description: 'Exact text to replace (must be unique in the source).' },
                replace: { type: 'string', description: 'Replacement text. Empty string deletes the match.' },
              },
              ['find', 'replace'],
            ),
          },
        },
        ['edits'],
      ),
      execute: async (input: { edits: { find: string; replace: string }[] }, { workspace }) => {
        let { source } = await workspace.getActiveDiagram();
        for (const [i, edit] of input.edits.entries()) {
          const first = source.indexOf(edit.find);
          if (!edit.find || first < 0) throw new Error(`edits[${i}]: text to find does not occur in the source`);
          if (source.indexOf(edit.find, first + 1) >= 0) {
            throw new Error(`edits[${i}]: text to find occurs more than once; include more context`);
          }
          source = source.slice(0, first) + edit.replace + source.slice(first + edit.find.length);
        }
        return summarize(await workspace.setActiveSource(source));
      },
    },
    {
      name: 'add_to_diagram',
      description:
        'Appends lines to the end of the open diagram (before a closing directive such as @enduml). Use it to add participants, messages, classes, nodes or relations.',
      mutating: true,
      inputSchema: object({ content: { type: 'string', description: 'Lines to add, in the language of the diagram.' } }, ['content']),
      execute: async (input: { content: string }, { workspace }) => {
        const { source } = await workspace.getActiveDiagram();
        return summarize(await workspace.setActiveSource(appendToSource(source, input.content)));
      },
    },
    {
      name: 'create_diagram',
      description:
        'Opens a new diagram with the given name and source in the editor, replacing what is open there. It is NOT saved: the user reviews and saves it. Returns diagnostics for the source.',
      mutating: true,
      inputSchema: object(
        {
          name: { type: 'string', description: 'Short, human readable name.' },
          source: { type: 'string', description: 'Complete diagram source.' },
          projectId: { ...projectId, description: 'Project the user will save it to. Defaults to the active project.' },
        },
        ['name', 'source'],
      ),
      execute: async (input: { name: string; source: string; projectId?: string }, { workspace }) => summarize(await workspace.createDiagram(input)),
    },
    {
      name: 'list_projects',
      description:
        'Lists the projects. Every diagram belongs to exactly one project; a project stores its diagrams in the browser, in a folder or in a Git repository. Returns id, name, description, storage type, whether it is the active (library) project and the number of diagrams.',
      inputSchema: object({}),
      execute: async (_input, { workspace }) => workspace.listProjects(),
    },
    {
      name: 'switch_project',
      description: 'Makes a project the active one: the library shows its diagrams and new diagrams are saved there. Does not change the open diagram.',
      inputSchema: object({ projectId: { type: 'string' } }, ['projectId']),
      execute: async (input: { projectId: string }, { workspace }) => {
        if (!(await workspace.setActiveProject(input.projectId))) throw new Error(`No project with id ${input.projectId}`);
        return { ok: true };
      },
    },
    {
      name: 'set_diagram_project',
      description:
        'Chooses the project the open, unsaved diagram will be saved to when the user saves it. Fails for diagrams that are already saved; the user moves those through the project menu.',
      inputSchema: object({ projectId: { type: 'string' } }, ['projectId']),
      execute: async (input: { projectId: string }, { workspace }) => summarize(await workspace.setActiveDiagramProject(input.projectId)),
    },
    {
      name: 'list_diagrams',
      description: 'Lists the saved diagrams of a project (id, name, language, diagram type, last update).',
      inputSchema: object({ projectId }),
      execute: async (input: { projectId?: string }, { workspace }) =>
        (await workspace.listDiagrams(input.projectId)).map((d) => ({
          id: d.id,
          name: d.name,
          language: d.languageId ?? null,
          diagramType: d.diagramType ?? null,
          updatedAt: d.updatedAt,
        })),
    },
    {
      name: 'read_diagram',
      description: 'Reads the source of a saved diagram without opening it.',
      inputSchema: object({ id: { type: 'string' }, projectId }, ['id']),
      execute: async (input: { id: string; projectId?: string }, { workspace }) => {
        const diagram = await workspace.readDiagram(input.id, input.projectId);
        if (!diagram) throw new Error(`No diagram with id ${input.id}`);
        return diagram;
      },
    },
    {
      name: 'open_diagram',
      description: 'Opens a saved diagram in the editor.',
      mutating: true,
      inputSchema: object({ id: { type: 'string' }, projectId }, ['id']),
      execute: async (input: { id: string; projectId?: string }, { workspace }) => {
        const snapshot = await workspace.openDiagram(input.id, input.projectId);
        if (!snapshot) throw new Error(`No diagram with id ${input.id}`);
        return summarize(snapshot, true);
      },
    },
    {
      name: 'rename_diagram',
      description: 'Renames the diagram open in the editor. Like every change, it is stored when the user saves.',
      mutating: true,
      inputSchema: object({ name: { type: 'string' } }, ['name']),
      execute: async (input: { name: string }, { workspace }) => {
        await workspace.renameActiveDiagram(input.name);
        return { ok: true };
      },
    },
    {
      name: 'convert_diagram',
      description:
        'Converts the open diagram to another diagram language via the metamodel of its diagram type. Only works for the targets listed in `conversionTargets`.',
      mutating: true,
      inputSchema: object({ targetLanguage: { type: 'string', description: 'Language id, e.g. "mermaid" or "plantuml".' } }, ['targetLanguage']),
      execute: async (input: { targetLanguage: string }, { workspace }) => {
        const { snapshot, warnings } = await workspace.convertActiveDiagram(input.targetLanguage);
        return { ...summarize(snapshot, true), warnings };
      },
    },
    {
      name: 'check_source',
      description:
        'Detects language and diagram type of a source text and validates it without changing the editor. Use it to verify a draft.',
      inputSchema: object({ source: { type: 'string' } }, ['source']),
      execute: async (input: { source: string }, { workspace }) => {
        const result = await workspace.checkSource(input.source);
        return {
          language: result.languageId,
          diagramType: result.diagramType,
          diagnostics: result.diagnostics,
          valid: !result.diagnostics.some((d) => d.severity === 'error'),
        };
      },
    },
    {
      name: 'list_capabilities',
      description: 'Lists the installed diagram languages, the diagram types they support and which types can be converted between languages.',
      inputSchema: object({}),
      execute: async (_input, { workspace }) => workspace.listCapabilities(),
    },
    {
      name: 'get_template',
      description: 'Returns a minimal, valid example for a diagram type in a language. Useful as a syntax reference.',
      inputSchema: object({ language: { type: 'string' }, diagramType: { type: 'string' } }, ['language', 'diagramType']),
      execute: async (input: { language: string; diagramType: string }, { workspace }) => {
        const template = await workspace.getTemplate(input.language, input.diagramType);
        if (!template) throw new Error(`No template for ${input.language}/${input.diagramType}`);
        return { template };
      },
    },
  ];
}

/** Registry of assistant tools (core tools plus plugin contributions). */
export class AiToolRegistry {
  private readonly tools = new Map<string, AiTool>();

  register(tool: AiTool): () => void {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) throw new Error(`Invalid tool name "${tool.name}"`);
    this.tools.set(tool.name, tool);
    return () => {
      if (this.tools.get(tool.name) === tool) this.tools.delete(tool.name);
    };
  }

  get(name: string): AiTool | undefined {
    return this.tools.get(name);
  }

  all(): AiTool[] {
    return [...this.tools.values()];
  }

  specs(): AiToolSpec[] {
    return this.all().map(toToolSpec);
  }

  /** Executes a tool; errors are returned as data so the model can react to them. */
  async execute(name: string, input: unknown, context: AiToolContext): Promise<{ output: unknown; isError: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) return { output: { error: `Unknown tool "${name}"` }, isError: true };
    try {
      return { output: (await tool.execute(input ?? {}, context)) ?? { ok: true }, isError: false };
    } catch (e) {
      return { output: { error: (e as Error).message || String(e) }, isError: true };
    }
  }
}

export interface SystemPromptInput {
  /** Locale of the UI; the assistant answers in it unless the user writes in another language. */
  locale: string;
  capabilities: LanguageCapability[];
  projects?: AiProjectSummary[];
}

const STORAGE_LABEL: Record<ProjectLocationType, string> = {
  'local-storage': 'browser storage',
  directory: 'folder',
  git: 'Git repository',
};

export function buildAiSystemPrompt(input: SystemPromptInput): string {
  const languages = input.capabilities
    .map((c) => `- ${c.name} (id: ${c.id}); diagram types: ${c.diagramTypes.join(', ')}`)
    .join('\n');
  return [
    'You are the assistant built into Sapia, an editor for text-based diagrams.',
    'You help the user create, understand, restructure and fix diagrams by calling the provided tools. The diagram in the editor is rendered live next to the source.',
    '',
    'Installed diagram languages:',
    languages || '- (none)',
    '',
    'Projects: every diagram belongs to one project, which stores its diagrams in the browser, in a folder or in a Git repository (each save is a commit).',
    ...(input.projects?.length
      ? input.projects.map(
          (p) =>
            `- ${p.name} (id: ${p.id}; ${STORAGE_LABEL[p.storage]}${p.location ? ` ${p.location}` : ''}; ${p.diagramCount} diagrams${p.active ? '; active' : ''}${p.isDefault ? '; default' : ''})${p.description ? `: ${p.description}` : ''}`,
        )
      : ['- (only the default project)']),
    '',
    'Guidelines:',
    '- Inspect the open diagram with get_active_diagram before changing it, unless the user asks for a brand-new diagram.',
    '- Make changes through the tools; do not just print diagram source for the user to paste.',
    '- You cannot save. Your changes and new diagrams stay unsaved in the editor until the user saves them; say so when you created or changed something. Never claim a diagram was saved.',
    '- New diagrams go to the active project. If the user names another project, pass its id to create_diagram or use set_diagram_project.',
    '- Keep the language the diagram is written in unless asked to convert. Use convert_diagram for conversions when a target is available.',
    '- For small changes prefer edit_diagram or add_to_diagram; use replace_diagram_source for rewrites.',
    '- Every modifying tool returns diagnostics. If it reports errors, fix them before answering.',
    '- Preserve existing identifiers, ordering and comments that the user did not ask to change.',
    '- Answer briefly: say what you changed in one or two sentences. Do not repeat the full source in your answer.',
    `- Reply in the language the user writes in; the interface language is "${input.locale}".`,
  ].join('\n');
}
