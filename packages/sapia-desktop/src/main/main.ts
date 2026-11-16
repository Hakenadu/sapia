import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { BrowserWindow, app, ipcMain, nativeTheme, protocol, shell } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import type { AiChatRequest, AiProviderConfig, DiagramDraft, HostPreferences, OnboardingResult } from '@sapia/core';
import { Ipc } from '../ipc';
import type { ToolResultMessage } from '../ipc';
import { HostService } from './host-service';
import { sapiaPaths } from './paths';
import { APP_HOST, serveStatic } from './protocol';

declare const __SAPIA_VERSION__: string;

const APP_URL = `sapia://${APP_HOST}/`;
const paths = sapiaPaths();
const windowStateFile = join(paths.home, 'window.json');

app.setName('Sapia');
// Chromium's profile lives next to the config so everything is in one place.
app.setPath('userData', join(paths.home, 'app-data'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'sapia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

/** `node_modules` this package was installed into (global or local), so sibling plugin packages are found. */
function siblingModules(): string | undefined {
  const packageDir = resolve(__dirname, '..');
  const scopeDir = dirname(packageDir);
  const modules = basename(scopeDir).startsWith('@') ? dirname(scopeDir) : scopeDir;
  return basename(modules) === 'node_modules' ? modules : undefined;
}

const host = new HostService({
  paths,
  webRoot: process.env['SAPIA_WEB_DIR'] ? resolve(process.env['SAPIA_WEB_DIR']) : join(__dirname, 'web'),
  appVersion: __SAPIA_VERSION__,
  systemLocales: () => app.getPreferredSystemLanguages(),
  siblingModules: siblingModules(),
  log: (message) => console.log(message),
});

let mainWindow: BrowserWindow | null = null;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

async function readWindowState(): Promise<WindowState> {
  try {
    const state = JSON.parse(await readFile(windowStateFile, 'utf8')) as WindowState;
    if (state.width >= 600 && state.height >= 400) return state;
  } catch {
    /* first start */
  }
  return { width: 1440, height: 900 };
}

function saveWindowState(window: BrowserWindow): void {
  const bounds = window.getNormalBounds();
  const state: WindowState = { ...bounds, maximized: window.isMaximized() };
  void mkdir(paths.home, { recursive: true })
    .then(() => writeFile(windowStateFile, JSON.stringify(state)))
    .catch(() => undefined);
}

function isAppUrl(url: string): boolean {
  return url.startsWith(APP_URL);
}

function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

/** IPC is only accepted from the app's own page in the main window. */
function trusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const frame = event.senderFrame;
  return !!mainWindow && event.sender === mainWindow.webContents && !!frame && isAppUrl(frame.url) && frame === event.sender.mainFrame;
}

function handle<A extends unknown[], R>(channel: string, listener: (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Forbidden');
    return listener(event, ...(args as A));
  });
}

function registerIpc(): void {
  handle(Ipc.bootstrap, () => host.bootstrap());
  handle(Ipc.completeOnboarding, async (_e, result: OnboardingResult) => {
    const bootstrap = await host.completeOnboarding(result);
    nativeTheme.themeSource = host.config.theme;
    return bootstrap;
  });
  handle(Ipc.updatePreferences, async (_e, preferences: HostPreferences) => {
    await host.updatePreferences(preferences);
    if (preferences.theme) nativeTheme.themeSource = preferences.theme;
  });

  handle(Ipc.storeList, () => host.store.list());
  handle(Ipc.storeGet, (_e, id: string) => host.store.get(String(id)));
  handle(Ipc.storeSave, (_e, draft: DiagramDraft) => host.store.save(draft));
  handle(Ipc.storeDelete, (_e, id: string) => host.store.delete(String(id)));

  // -- AI: the model runs here, its tools run in the renderer ------------------
  const pendingTools = new Map<string, { requestId: string; resolve: (output: unknown) => void; reject: (error: Error) => void }>();
  ipcMain.on(Ipc.aiToolResult, (event, message: ToolResultMessage) => {
    if (!trusted(event)) return;
    const pending = pendingTools.get(message?.callId);
    if (!pending) return;
    pendingTools.delete(message.callId);
    if (message.error !== undefined) pending.reject(new Error(message.error));
    else pending.resolve(message.output);
  });
  handle(Ipc.aiChat, async (event, requestId: string, request: AiChatRequest) => {
    const sender = event.sender;
    try {
      await host.ai.chat(request, {
        onEvent: (streamEvent) => {
          if (!sender.isDestroyed()) sender.send(Ipc.aiEvent, requestId, streamEvent);
        },
        executeTool: (name, input) =>
          new Promise((resolveTool, reject) => {
            if (sender.isDestroyed()) return reject(new Error('The window was closed.'));
            const callId = randomUUID();
            pendingTools.set(callId, { requestId, resolve: resolveTool, reject });
            sender.send(Ipc.aiTool, requestId, callId, name, input);
          }),
      });
    } finally {
      for (const [callId, pending] of pendingTools) {
        if (pending.requestId !== requestId) continue;
        pendingTools.delete(callId);
        pending.reject(new Error('The request ended.'));
      }
    }
  });
  handle(Ipc.aiAbort, (_e, sessionId: string) => host.ai.abort(String(sessionId)));
  handle(Ipc.aiReset, (_e, sessionId: string) => host.ai.reset(String(sessionId)));
  handle(Ipc.aiTest, (_e, provider: AiProviderConfig) => host.ai.testProvider(provider));

  handle(Ipc.showConfigFile, async () => {
    if (existsSync(paths.config)) shell.showItemInFolder(paths.config);
    else await shell.openPath(paths.home);
  });
  handle(Ipc.openExternal, (_e, url: string) => openExternal(String(url)));
}

async function createWindow(): Promise<void> {
  const state = await readWindowState();
  const dark = nativeTheme.shouldUseDarkColors;
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: 'Sapia',
    icon: join(__dirname, 'icon.png'),
    backgroundColor: dark ? '#090b10' : '#f3f4f8',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow = window;
  if (state.maximized) window.maximize();

  window.once('ready-to-show', () => window.show());
  window.on('close', () => saveWindowState(window));
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // The window only ever shows the app itself; links open in the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write');
  });

  await window.loadURL(APP_URL);
}

function printHelp(): void {
  console.log(`Sapia Desktop ${__SAPIA_VERSION__}

Usage: sapia [options]

Options:
  -v, --version   Print the version
  -h, --help      Show this help

Configuration:    ${paths.config}
Diagrams:         ${paths.diagrams}
Plugins:          npm install --prefix ${paths.plugins} <package>, then list the package under "plugins"
Environment:      SAPIA_HOME overrides the configuration directory (default ~/.sapia)`);
}

const args = process.argv.slice(app.isPackaged ? 1 : 2);
if (args.includes('--version') || args.includes('-v')) {
  console.log(__SAPIA_VERSION__);
  app.exit(0);
} else if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  app.exit(0);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) void createWindow();
  });

  void app.whenReady().then(async () => {
    await host.initialise();
    nativeTheme.themeSource = host.config.theme;
    protocol.handle('sapia', (request) => serveStatic(request.url, host.roots));
    registerIpc();
    await createWindow();
  });
}
