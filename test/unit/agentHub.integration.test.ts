import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentHub, type AgentHubConnection } from '../../desktop/agentHub';
import type { AgentHubSnapshot } from '../../src/contracts/agent';

describe('AgentHub HTTP integration', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => { while (cleanups.length) cleanups.pop()?.(); });

  it('authenticates events, streams SSE, and consumes a request-scoped decision once', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-light-hub-'));
    const hub = new AgentHub(directory);
    const connection = await hub.start();
    const abort = new AbortController();
    cleanups.push(() => { abort.abort(); hub.stop(); expect(() => statSync(join(directory, 'connection.json'))).toThrow(); rmSync(directory, { recursive: true, force: true }); });

    const health = await fetch(`${connection.endpoint}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, protocol: 'agent-light/1' });
    expect(statSync(join(directory, 'connection.json')).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(join(directory, 'connection.json'), 'utf8'))).toEqual(connection);

    expect((await fetch(`${connection.endpoint}/events?token=wrong`)).status).toBe(401);
    expect((await postEvent(connection, { version: 1 })).status).toBe(400);
    expect((await postEvent(connection, { version: 1, provider: 'codex', sessionId: 'invalid-time', phase: 'running', occurredAtEpochMs: 'now' })).status).toBe(400);
    expect((await fetch(`${connection.endpoint}/v1/events`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
      body: '{}'
    })).status).toBe(401);

    const accepted = await postEvent(connection, {
      version: 1,
      provider: 'codex',
      sessionId: 'session-1',
      requestId: 'request-1',
      phase: 'waiting',
      title: 'Codex needs approval',
      actions: [{ id: 'allow', label: 'Allow', kind: 'primary' }, { id: 'deny', label: 'Deny', kind: 'destructive' }]
    });
    expect(accepted.status).toBe(202);

    const stream = await fetch(`${connection.endpoint}/events?token=${connection.token}`, { signal: abort.signal });
    expect(stream.status).toBe(200);
    const snapshot = await readSnapshot(stream);
    expect(snapshot.sessions[0]).toMatchObject({ provider: 'codex', sessionId: 'session-1', requestId: 'request-1', phase: 'waiting' });

    expect((await postReply(connection, { provider: 'codex', sessionId: 'session-1', requestId: 'stale', actionId: 'allow' })).status).toBe(409);
    expect((await postReply(connection, { provider: 'codex', sessionId: 'session-1', requestId: 'request-1', actionId: 'unknown' })).status).toBe(409);
    expect((await postReply(connection, { provider: 'codex', sessionId: 'session-1', requestId: 'request-1', actionId: 'allow' })).status).toBe(200);

    const decisionUrl = new URL('/v1/decision', connection.endpoint);
    decisionUrl.search = new URLSearchParams({ provider: 'codex', sessionId: 'session-1', requestId: 'request-1' }).toString();
    const first = await fetch(decisionUrl, { headers: auth(connection) });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ actionId: 'allow' });
    expect((await fetch(decisionUrl, { headers: auth(connection) })).status).toBe(204);

    for (const event of [
      { version: 1, provider: 'codex', sessionId: 'scope:one', requestId: 'request', phase: 'waiting', actions: [{ id: 'allow', label: 'Allow' }] },
      { version: 1, provider: 'codex', sessionId: 'scope', requestId: 'one:request', phase: 'waiting', actions: [{ id: 'allow', label: 'Allow' }] }
    ]) expect((await postEvent(connection, event)).status).toBe(202);
    expect((await postReply(connection, { provider: 'codex', sessionId: 'scope:one', requestId: 'request', actionId: 'allow' })).status).toBe(200);
    expect((await getDecision(connection, 'codex', 'scope', 'one:request')).status).toBe(204);
    expect((await getDecision(connection, 'codex', 'scope:one', 'request')).status).toBe(200);
  });
});

async function postEvent(connection: AgentHubConnection, event: unknown): Promise<Response> {
  return fetch(`${connection.endpoint}/v1/events`, { method: 'POST', headers: { ...auth(connection), 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
}
async function postReply(connection: AgentHubConnection, reply: unknown): Promise<Response> {
  return fetch(`${connection.endpoint}/v1/reply`, { method: 'POST', headers: { ...auth(connection), 'Content-Type': 'application/json' }, body: JSON.stringify(reply) });
}
function getDecision(connection: AgentHubConnection, provider: string, sessionId: string, requestId: string): Promise<Response> {
  const url = new URL('/v1/decision', connection.endpoint);
  url.search = new URLSearchParams({ provider, sessionId, requestId }).toString();
  return fetch(url, { headers: auth(connection) });
}
function auth(connection: AgentHubConnection): Record<string, string> { return { Authorization: `Bearer ${connection.token}` }; }
async function readSnapshot(response: Response): Promise<AgentHubSnapshot> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('SSE response has no body');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const next = await reader.read();
    if (next.done) throw new Error('SSE stream ended before a state event');
    buffer += decoder.decode(next.value, { stream: true });
    const match = buffer.match(/event: state\ndata: (.+?)\n\n/s);
    if (match) { await reader.cancel(); return JSON.parse(match[1]) as AgentHubSnapshot; }
  }
}
