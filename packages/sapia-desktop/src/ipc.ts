/** IPC channel names shared by the main process and the preload script. */
export const Ipc = {
  bootstrap: 'sapia:bootstrap',
  completeOnboarding: 'sapia:onboarding:complete',
  updatePreferences: 'sapia:preferences:update',
  projectTypes: 'sapia:projects:types',
  projectList: 'sapia:projects:list',
  projectSave: 'sapia:projects:save',
  projectDelete: 'sapia:projects:delete',
  projectSync: 'sapia:projects:sync',
  projectResolve: 'sapia:projects:resolve',
  projectPickDirectory: 'sapia:projects:pick-directory',
  projectReveal: 'sapia:projects:reveal',
  diagramList: 'sapia:diagrams:list',
  diagramGet: 'sapia:diagrams:get',
  diagramSave: 'sapia:diagrams:save',
  diagramDelete: 'sapia:diagrams:delete',
  diagramMove: 'sapia:diagrams:move',
  aiChat: 'sapia:ai:chat',
  aiAbort: 'sapia:ai:abort',
  aiReset: 'sapia:ai:reset',
  aiTest: 'sapia:ai:test',
  /** main → renderer: a stream event of a running chat. */
  aiEvent: 'sapia:ai:event',
  /** main → renderer: run a tool; answered with {@link Ipc.aiToolResult}. */
  aiTool: 'sapia:ai:tool',
  aiToolResult: 'sapia:ai:tool-result',
  showConfigFile: 'sapia:config:show',
  openExternal: 'sapia:open-external',
  /** renderer → main: share links received before the page was ready. */
  takeLinks: 'sapia:links:take',
  /** main → renderer: a share link the operating system handed over. */
  openLink: 'sapia:links:open',
} as const;

export interface ToolResultMessage {
  callId: string;
  output?: unknown;
  error?: string;
}
