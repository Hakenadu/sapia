import { contextBridge, ipcRenderer } from 'electron';
import type { AiChatHandlers, AiChatRequest, AiProviderConfig, ConflictResolution, DiagramDraft, HostPreferences, OnboardingResult, ProjectDraft, ProjectRemoval, SapiaHost } from '@sapia/core';
import { Ipc } from '../ipc';
import type { ToolResultMessage } from '../ipc';

// The page runs sandboxed without Node; this narrow bridge is all it gets.
const chats = new Map<string, AiChatHandlers>();

ipcRenderer.on(Ipc.aiEvent, (_event, requestId: string, streamEvent) => {
  chats.get(requestId)?.onEvent(streamEvent);
});

ipcRenderer.on(Ipc.aiTool, async (_event, requestId: string, callId: string, name: string, input: unknown) => {
  const reply = (message: ToolResultMessage) => ipcRenderer.send(Ipc.aiToolResult, message);
  const chat = chats.get(requestId);
  if (!chat) return reply({ callId, error: 'The conversation is no longer active.' });
  try {
    reply({ callId, output: (await chat.executeTool(name, input)) ?? null });
  } catch (e) {
    reply({ callId, error: e instanceof Error ? e.message : String(e) });
  }
});

const host: SapiaHost = {
  platform: 'desktop',
  getBootstrap: () => ipcRenderer.invoke(Ipc.bootstrap),
  completeOnboarding: (result: OnboardingResult) => ipcRenderer.invoke(Ipc.completeOnboarding, result),
  updatePreferences: (preferences: HostPreferences) => ipcRenderer.invoke(Ipc.updatePreferences, preferences),
  projects: {
    locationTypes: () => ipcRenderer.invoke(Ipc.projectTypes),
    listProjects: () => ipcRenderer.invoke(Ipc.projectList),
    saveProject: (draft: ProjectDraft) => ipcRenderer.invoke(Ipc.projectSave, draft),
    deleteProject: (id: string, removal: ProjectRemoval) => ipcRenderer.invoke(Ipc.projectDelete, id, removal),
    sync: (projectId: string) => ipcRenderer.invoke(Ipc.projectSync, projectId),
    resolveConflicts: (projectId: string, resolutions: Record<string, ConflictResolution>) => ipcRenderer.invoke(Ipc.projectResolve, projectId, resolutions),
    pickDirectory: (initial?: string) => ipcRenderer.invoke(Ipc.projectPickDirectory, initial),
    revealProject: (projectId: string) => ipcRenderer.invoke(Ipc.projectReveal, projectId),
    listDiagrams: (projectId: string) => ipcRenderer.invoke(Ipc.diagramList, projectId),
    getDiagram: (projectId: string, id: string) => ipcRenderer.invoke(Ipc.diagramGet, projectId, id),
    saveDiagram: (projectId: string, draft: DiagramDraft) => ipcRenderer.invoke(Ipc.diagramSave, projectId, draft),
    deleteDiagram: (projectId: string, id: string) => ipcRenderer.invoke(Ipc.diagramDelete, projectId, id),
    moveDiagram: (id: string, from: string, to: string) => ipcRenderer.invoke(Ipc.diagramMove, id, from, to),
  },
  ai: {
    // An AbortSignal cannot cross the bridge; the UI calls abort() instead.
    chat: async (request: AiChatRequest, handlers: AiChatHandlers) => {
      const requestId = crypto.randomUUID();
      chats.set(requestId, handlers);
      try {
        await ipcRenderer.invoke(Ipc.aiChat, requestId, request);
      } finally {
        chats.delete(requestId);
      }
    },
    abort: (sessionId: string) => ipcRenderer.invoke(Ipc.aiAbort, sessionId),
    reset: (sessionId: string) => ipcRenderer.invoke(Ipc.aiReset, sessionId),
    testProvider: (provider: AiProviderConfig) => ipcRenderer.invoke(Ipc.aiTest, provider),
  },
  showConfigFile: () => ipcRenderer.invoke(Ipc.showConfigFile),
  openExternal: (url: string) => ipcRenderer.invoke(Ipc.openExternal, url),
  onOpenLink: (handler: (link: string) => void) => {
    ipcRenderer.on(Ipc.openLink, (_event, link: string) => handler(link));
    void ipcRenderer.invoke(Ipc.takeLinks).then((links: string[]) => links.forEach(handler));
  },
};

contextBridge.exposeInMainWorld('sapiaHost', host);

// Lets the page leave room for the window controls drawn over it on macOS.
if (process.platform === 'darwin') {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset['shell'] = 'mac';
  });
}
