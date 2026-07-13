import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function connectionPath() {
  return process.env.AGENT_LIGHT_CONNECTION
    ?? join(homedir(), 'Library', 'Application Support', 'Agent Light', 'connection.json');
}

export async function readConnection() {
  const connection = JSON.parse(await readFile(connectionPath(), 'utf8'));
  if (!connection || typeof connection !== 'object' || connection.protocol !== 'agent-light/1' || typeof connection.token !== 'string' || !connection.token) {
    throw new Error('Invalid Agent Light connection file');
  }
  const endpoint = new URL(connection.endpoint);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.username || endpoint.password) {
    throw new Error('Agent Light endpoint must be an authenticated loopback HTTP server');
  }
  return { endpoint: endpoint.origin, token: connection.token, protocol: connection.protocol };
}

export async function sendAgentEvent(event) {
  const connection = await readConnection();
  const response = await fetch(`${connection.endpoint}/v1/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) throw new Error(`Agent Light rejected event (${response.status})`);
}

export async function waitForDecision(provider, sessionId, requestId, timeoutMs = 9 * 60_000) {
  if (typeof requestId === 'number') {
    timeoutMs = requestId;
    requestId = undefined;
  }
  const connection = await readConnection();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = new URL('/v1/decision', connection.endpoint);
    url.searchParams.set('provider', provider);
    url.searchParams.set('sessionId', sessionId);
    if (requestId) url.searchParams.set('requestId', requestId);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${connection.token}` }, signal: AbortSignal.timeout(3_000) });
    if (response.status === 200) return (await response.json()).actionId;
    if (response.status !== 204) throw new Error(`Agent Light decision failed (${response.status})`);
    await new Promise(resolve => setTimeout(resolve, 450));
  }
  return undefined;
}

export async function readStdinJson() {
  let value = '';
  for await (const chunk of process.stdin) {
    value += String(chunk);
    if (value.length > 1_000_000) throw new Error('Hook input is too large');
  }
  return value.trim() ? JSON.parse(value) : {};
}
