import * as vscode from 'vscode';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { QuickReplyActionId } from '../contracts/terminal';
import type { MonitorStateSnapshot } from '../contracts/state';
import { QuickReplyService } from '../services/quickReplyService';
import { StateStore } from '../state/stateStore';

export class DesktopBridge implements vscode.Disposable {
  private readonly token = randomBytes(32).toString('hex');
  private readonly clients = new Set<ServerResponse>();
  private server?: Server;
  private port?: number;
  private desktop?: ChildProcess;
  private stateSubscription?: { dispose(): void };
  constructor(private readonly extensionPath: string, private readonly storagePath: string, private readonly store: StateStore, private readonly replies: QuickReplyService) {}

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => void this.handleRequest(request, response));
    await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(0, '127.0.0.1', () => resolve()); });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('无法创建悬浮窗通信服务');
    this.port = address.port;
    this.stateSubscription = this.store.subscribe(snapshot => this.broadcast(snapshot));
  }

  async openWindow(): Promise<{ success: boolean; message: string }> {
    await this.start();
    if (this.desktop && !this.desktop.killed) return { success: true, message: '悬浮窗已经打开' };
    const electronPath = await resolveElectronPath(this.extensionPath, this.storagePath);
    const mainPath = join(this.extensionPath, 'dist', 'desktop-main.js');
    if (!electronPath || !existsSync(mainPath)) return { success: false, message: '找不到桌面端运行文件，请先执行 npm install 和 npm run build' };
    const childEnvironment = { ...process.env };
    delete childEnvironment.ELECTRON_RUN_AS_NODE;
    this.desktop = spawn(electronPath, [mainPath], {
      detached: false,
      stdio: 'ignore',
      env: { ...childEnvironment, TRAFFIC_LIGHT_PORT: String(this.port), TRAFFIC_LIGHT_TOKEN: this.token, TRAFFIC_LIGHT_EXTENSION_PATH: this.extensionPath }
    });
    this.desktop.once('exit', () => { this.desktop = undefined; });
    this.desktop.once('error', () => { this.desktop = undefined; });
    return { success: true, message: '已打开桌面悬浮窗' };
  }

  closeWindow(): void { this.desktop?.kill(); this.desktop = undefined; }

  private async handleRequest(request: import('node:http').IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${this.port}`);
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders({ 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' })); response.end(); return;
    }
    if (url.pathname === '/events' && request.method === 'GET') {
      if (url.searchParams.get('token') !== this.token) return endJson(response, 401, { success: false, message: 'Unauthorized' });
      response.writeHead(200, corsHeaders({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' }));
      this.clients.add(response); this.send(response, this.store.getSnapshot());
      request.once('close', () => this.clients.delete(response));
      return;
    }
    if (url.pathname === '/reply' && request.method === 'POST') {
      if (request.headers.authorization !== `Bearer ${this.token}`) return endJson(response, 401, { success: false, message: 'Unauthorized' });
      try {
        const body = await readJsonBody(request);
        if (!isReplyRequest(body)) return endJson(response, 400, { success: false, message: '无效的快捷回复请求' });
        return endJson(response, 200, await this.replies.reply(body));
      } catch { return endJson(response, 400, { success: false, message: '无法读取请求' }); }
    }
    endJson(response, 404, { success: false, message: 'Not found' });
  }
  private send(response: ServerResponse, snapshot: MonitorStateSnapshot): void { response.write(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`); }
  private broadcast(snapshot: MonitorStateSnapshot): void { for (const client of this.clients) this.send(client, snapshot); }
  dispose(): void { this.closeWindow(); this.stateSubscription?.dispose(); for (const client of this.clients) client.end(); this.clients.clear(); this.server?.close(); this.server = undefined; }
}

async function resolveElectronPath(extensionPath: string, storagePath: string): Promise<string | undefined> {
  try {
    const value = require(join(extensionPath, 'node_modules', 'electron'));
    if (typeof value === 'string') return value;
  } catch { /* Packaged releases carry a native archive instead. */ }
  const executable = join(storagePath, 'electron', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  if (existsSync(executable)) return executable;
  const archive = join(extensionPath, 'resources', 'electron-darwin-arm64.zip');
  if (!existsSync(archive)) return undefined;
  mkdirSync(join(storagePath, 'electron'), { recursive: true });
  await promisify(execFile)('/usr/bin/ditto', ['-x', '-k', archive, join(storagePath, 'electron')]);
  return existsSync(executable) ? executable : undefined;
}
function corsHeaders(extra: Record<string, string>): Record<string, string> { return { 'Access-Control-Allow-Origin': 'null', Vary: 'Origin', ...extra }; }
function endJson(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })); response.end(JSON.stringify(value)); }
async function readJsonBody(request: import('node:http').IncomingMessage): Promise<unknown> { let body = ''; for await (const chunk of request) { body += String(chunk); if (body.length > 10_000) throw new Error('too large'); } return JSON.parse(body); }
function isReplyRequest(value: unknown): value is { requestId: string; terminalId: string; blockId: string; actionId: QuickReplyActionId } { if (!value || typeof value !== 'object') return false; const v = value as Record<string, unknown>; return typeof v.requestId === 'string' && typeof v.terminalId === 'string' && typeof v.blockId === 'string' && ['confirmYes', 'confirmNo', 'confirmOverwrite', 'cancel', 'selectOption1', 'selectOption2', 'selectOption3', 'selectOption4', 'selectOption5'].includes(String(v.actionId)); }
