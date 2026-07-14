import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { isAgentEvent, type AgentHubSnapshot } from '../src/contracts/agent';
import { AgentHubStore } from './agentHubStore';

export interface AgentHubConnection { endpoint: string; token: string; protocol: 'agent-light/1'; }

export class AgentHub {
  private readonly token = randomBytes(32).toString('hex');
  private readonly store = new AgentHubStore();
  private readonly clients = new Set<ServerResponse>();
  private server?: Server;
  private connection?: AgentHubConnection;
  private readonly decisions = new Map<string, { actionId: string; createdAtEpochMs: number }>();

  constructor(private readonly userDataPath: string) {}

  async start(): Promise<AgentHubConnection> {
    if (this.connection) return this.connection;
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch(() => {
        if (!response.headersSent) endJson(response, 500, { success: false, message: 'Internal error' });
        else response.destroy();
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(0, '127.0.0.1', resolve);
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to bind Agent Light event hub');
    this.connection = { endpoint: `http://127.0.0.1:${address.port}`, token: this.token, protocol: 'agent-light/1' };
    this.writeConnectionFile(this.connection);
    return this.connection;
  }

  stop(): void {
    for (const client of this.clients) client.end();
    this.clients.clear();
    this.server?.close();
    this.server = undefined;
    this.removeConnectionFile();
    this.connection = undefined;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.connection?.endpoint ?? 'http://127.0.0.1');
    if (request.method === 'OPTIONS') return end(response, 204, undefined, corsHeaders());
    if (url.pathname === '/health' && request.method === 'GET') return endJson(response, 200, { ok: true, protocol: 'agent-light/1' });
    if (url.pathname === '/events' && request.method === 'GET') {
      if (url.searchParams.get('token') !== this.token) return endJson(response, 401, { success: false, message: 'Unauthorized' });
      response.writeHead(200, corsHeaders({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' }));
      this.clients.add(response);
      this.send(response, this.store.snapshot());
      response.once('close', () => this.clients.delete(response));
      return;
    }
    if (url.pathname === '/v1/events' && request.method === 'POST') {
      if (request.headers.authorization !== `Bearer ${this.token}`) return endJson(response, 401, { success: false, message: 'Unauthorized' });
      try {
        const event = await readJson(request);
        if (!isAgentEvent(event)) return endJson(response, 400, { success: false, message: 'Invalid agent event' });
        const snapshot = this.store.apply(event);
        for (const client of this.clients) this.send(client, snapshot);
        return endJson(response, 202, { success: true, revision: snapshot.revision });
      } catch { return endJson(response, 400, { success: false, message: 'Invalid request body' }); }
    }
    if (url.pathname === '/v1/reply' && request.method === 'POST') {
      if (request.headers.authorization !== `Bearer ${this.token}`) return endJson(response, 401, { success: false, message: 'Unauthorized' });
      try {
        const body = await readJson(request) as Record<string, unknown>;
        if (typeof body.provider !== 'string' || typeof body.sessionId !== 'string' || typeof body.actionId !== 'string' || (body.requestId !== undefined && typeof body.requestId !== 'string')) return endJson(response, 400, { success: false, message: 'Invalid reply' });
        const session = this.store.get(body.provider, body.sessionId);
        const requestId = typeof body.requestId === 'string' ? body.requestId : undefined;
        if (!session || session.phase !== 'waiting' || !session.actions?.some(action => action.id === body.actionId) || session.requestId !== requestId) return endJson(response, 409, { success: false, message: '确认请求已失效，请等待 Agent 更新' });
        this.pruneDecisions();
        const key = decisionKey(body.provider, body.sessionId, requestId);
        if (this.decisions.has(key)) return endJson(response, 409, { success: false, message: '该确认已经回复' });
        this.decisions.set(key, { actionId: body.actionId, createdAtEpochMs: Date.now() });
        while (this.decisions.size > 128) this.decisions.delete(this.decisions.keys().next().value!);
        return endJson(response, 200, { success: true, message: '选择已发送给 Agent' });
      } catch { return endJson(response, 400, { success: false, message: 'Invalid request body' }); }
    }
    if (url.pathname === '/v1/decision' && request.method === 'GET') {
      if (request.headers.authorization !== `Bearer ${this.token}`) return endJson(response, 401, { success: false, message: 'Unauthorized' });
      const key = decisionKey(url.searchParams.get('provider') ?? '', url.searchParams.get('sessionId') ?? '', url.searchParams.get('requestId') ?? undefined);
      this.pruneDecisions();
      const decision = this.decisions.get(key);
      if (!decision) return end(response, 204, undefined, corsHeaders({ 'Cache-Control': 'no-store' }));
      this.decisions.delete(key);
      return endJson(response, 200, { actionId: decision.actionId });
    }
    return endJson(response, 404, { success: false, message: 'Not found' });
  }

  private send(response: ServerResponse, snapshot: AgentHubSnapshot): void { response.write(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`); }
  private writeConnectionFile(connection: AgentHubConnection): void {
    mkdirSync(this.userDataPath, { recursive: true });
    const path = join(this.userDataPath, 'connection.json');
    writeFileSync(path, `${JSON.stringify(connection, null, 2)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  private removeConnectionFile(): void {
    try {
      const path = join(this.userDataPath, 'connection.json');
      const current = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentHubConnection>;
      if (current.token === this.token) unlinkSync(path);
    } catch { /* missing or replaced connection files are left alone */ }
  }
  private pruneDecisions(now = Date.now()): void {
    for (const [key, decision] of this.decisions) if (now - decision.createdAtEpochMs > 10 * 60_000) this.decisions.delete(key);
  }
}

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> { return { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'X-Content-Type-Options': 'nosniff', ...extra }; }
function end(response: ServerResponse, status: number, body?: string, headers: Record<string, string> = {}): void { response.writeHead(status, headers); response.end(body); }
function endJson(response: ServerResponse, status: number, value: unknown): void { end(response, status, JSON.stringify(value), corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })); }
async function readJson(request: IncomingMessage): Promise<unknown> { let body = ''; for await (const chunk of request) { body += String(chunk); if (body.length > 25_000) throw new Error('too large'); } return JSON.parse(body); }
function decisionKey(provider: string, sessionId: string, requestId?: string): string { return JSON.stringify([provider, sessionId, requestId ?? null]); }
