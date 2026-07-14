import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeferredBoundsSaver } from './deferredBoundsSaver';
import { AgentHub, type AgentHubConnection } from './agentHub';

const isStandalone = !process.env.TRAFFIC_LIGHT_PORT;
if (isStandalone) {
  app.setName('Agent Light');
  app.setPath('userData', process.env.AGENT_LIGHT_USER_DATA_PATH || join(app.getPath('appData'), 'Agent Light'));
}
const ownsSingleInstance = !isStandalone || app.requestSingleInstanceLock();

let window: BrowserWindow | undefined;
let expanded = false;
let collapsedBounds: Electron.Rectangle | undefined;
let boundsSaver: DeferredBoundsSaver<Electron.Rectangle> | undefined;
let localHub: AgentHub | undefined;
let connection: AgentHubConnection | { endpoint: string; token: string; protocol: 'terminal/1' } | undefined;
const COLLAPSED_SIZE = 124;
const DEFAULT_EXPANDED_SIZE = { width: 360, height: 360 };

function createWindow(): void {
  const saved = readSettings();
  const initialBounds = saved.bounds && isVisible(saved.bounds) ? { x: saved.bounds.x, y: saved.bounds.y, width: COLLAPSED_SIZE, height: COLLAPSED_SIZE } : undefined;
  window = new BrowserWindow({
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    x: initialBounds?.x,
    y: initialBounds?.y,
    minWidth: COLLAPSED_SIZE,
    minHeight: COLLAPSED_SIZE,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: process.platform === 'darwin' ? 'hud' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    resizable: false,
    alwaysOnTop: saved.alwaysOnTop ?? true,
    show: false,
    hasShadow: true,
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: { preload: join(__dirname, 'desktop-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (initialBounds) window.setBounds(initialBounds);
  collapsedBounds = window.getBounds();
  boundsSaver = new DeferredBoundsSaver(() => expanded, () => window!.getBounds(), bounds => { collapsedBounds = bounds; if (window) writeSettings({ ...readSettings(), bounds, alwaysOnTop: window.isAlwaysOnTop() }); });
  window.setAlwaysOnTop(saved.alwaysOnTop ?? true, 'floating');
  if (process.platform === 'darwin') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.loadFile(join(assetRoot(), 'desktop', 'index.html'));
  window.once('ready-to-show', () => {
    window?.showInactive();
    if (process.env.AGENT_LIGHT_CAPTURE_PATH && window) {
      expanded = true;
      window.setSize(400, 520, false);
      void window.webContents.executeJavaScript('document.body.classList.remove("collapsed")');
    }
  });
  window.on('move', scheduleSave); window.on('resize', scheduleSave);
  window.on('closed', () => { boundsSaver?.cancel(); boundsSaver = undefined; window = undefined; app.quit(); });
}

ipcMain.handle('window:set-always-on-top', (_event, value: boolean) => { if (!window) return false; window.setAlwaysOnTop(value, 'floating'); writeSettings({ ...readSettings(), alwaysOnTop: value, bounds: collapsedBounds }); return value; });
ipcMain.handle('window:is-always-on-top', () => window?.isAlwaysOnTop() ?? false);
ipcMain.handle('bridge:get-connection', () => ({ ...connection, capturePath: process.env.AGENT_LIGHT_CAPTURE_PATH }));
ipcMain.handle('diagnostics:capture', async (_event, path: string) => { if (!window || !process.env.AGENT_LIGHT_CAPTURE_PATH || path !== process.env.AGENT_LIGHT_CAPTURE_PATH) return false; const image = await window.webContents.capturePage(); writeFileSync(path, image.toPNG()); return true; });
ipcMain.handle('window:set-expanded', (_event, value: boolean, reduceMotion = false, preferredSize?: { width: number; height: number }) => {
  if (!window || expanded === value) return expanded;
  if (value) {
    boundsSaver?.cancel(); collapsedBounds = window.getBounds(); expanded = true;
    return animateWindowBounds(expandedBoundsAround(collapsedBounds, preferredSize), reduceMotion ? 0 : 180, easeOutQuint).then(() => expanded);
  } else {
    expanded = false;
    if (collapsedBounds) return animateWindowBounds(collapsedBounds, reduceMotion ? 0 : 135, easeInOutCubic).then(() => expanded);
  }
  return expanded;
});
ipcMain.on('window:close', () => window?.close());

function scheduleSave(): void { boundsSaver?.schedule(); }
function assetRoot(): string {
  if (process.env.TRAFFIC_LIGHT_EXTENSION_PATH) return process.env.TRAFFIC_LIGHT_EXTENSION_PATH;
  if (existsSync(join(app.getAppPath(), 'desktop', 'index.html'))) return app.getAppPath();
  return join(app.getAppPath(), '..');
}
function settingsPath(): string { return join(app.getPath('userData'), 'floating-window.json'); }
function readSettings(): { bounds?: Electron.Rectangle; alwaysOnTop?: boolean } { try { return existsSync(settingsPath()) ? JSON.parse(readFileSync(settingsPath(), 'utf8')) : {}; } catch { return {}; } }
function writeSettings(value: unknown): void { try { writeFileSync(settingsPath(), JSON.stringify(value)); } catch { /* settings are optional */ } }
function isVisible(bounds: Electron.Rectangle): boolean { return screen.getAllDisplays().some(display => intersects(bounds, display.workArea)); }
function intersects(a: Electron.Rectangle, b: Electron.Rectangle): boolean { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
function expandedBoundsAround(anchor: Electron.Rectangle, preferredSize = DEFAULT_EXPANDED_SIZE): Electron.Rectangle {
  const display = screen.getDisplayMatching(anchor); const work = display.workArea;
  const size = { width: Math.min(work.width - 16, Math.max(320, Math.round(preferredSize.width))), height: Math.min(work.height - 16, Math.max(340, Math.round(preferredSize.height))) };
  const centeredX = Math.round(anchor.x + anchor.width / 2 - size.width / 2);
  const centeredY = Math.round(anchor.y + anchor.height / 2 - 76);
  return { x: Math.min(work.x + work.width - size.width, Math.max(work.x, centeredX)), y: Math.min(work.y + work.height - size.height, Math.max(work.y, centeredY)), ...size };
}
function animateWindowBounds(target: Electron.Rectangle, durationMs: number, easing: (value: number) => number): Promise<void> {
  if (!window) return Promise.resolve();
  if (durationMs === 0) { window.setBounds(target, false); return Promise.resolve(); }
  const start = window.getBounds(); const startedAt = performance.now();
  return new Promise(resolve => {
    const step = (): void => {
      if (!window) return resolve();
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs); const eased = easing(progress);
      window.setBounds({ x: interpolate(start.x, target.x, eased), y: interpolate(start.y, target.y, eased), width: interpolate(start.width, target.width, eased), height: interpolate(start.height, target.height, eased) }, false);
      if (progress < 1) setTimeout(step, 16); else { window.setBounds(target, false); resolve(); }
    };
    step();
  });
}
function interpolate(from: number, to: number, progress: number): number { return Math.round(from + (to - from) * progress); }
function easeOutQuint(value: number): number { return 1 - Math.pow(1 - value, 5); }
function easeInOutCubic(value: number): number { return value < .5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2; }

async function start(): Promise<void> {
  if (process.env.TRAFFIC_LIGHT_PORT) {
    connection = { endpoint: `http://127.0.0.1:${Number(process.env.TRAFFIC_LIGHT_PORT)}`, token: process.env.TRAFFIC_LIGHT_TOKEN ?? '', protocol: 'terminal/1' };
  } else {
    localHub = new AgentHub(app.getPath('userData'));
    connection = await localHub.start();
  }
  createWindow();
}

if (!ownsSingleInstance) {
  app.quit();
} else {
  if (isStandalone) app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(start).catch(error => { console.error('Agent Light failed to start', error); app.quit(); });
  app.on('before-quit', () => localHub?.stop());
  app.on('window-all-closed', () => app.quit());
}
