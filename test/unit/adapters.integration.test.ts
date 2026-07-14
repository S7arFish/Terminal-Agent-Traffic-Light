import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentHub, type AgentHubConnection } from '../../desktop/agentHub';

describe('agent adapter integration', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => { while (cleanups.length) cleanups.pop()?.(); });

  it.each([
    {
      name: 'Claude Code',
      script: 'claude-code-hook.mjs',
      provider: 'claude-code',
      sessionId: 'claude-session',
      requestId: 'claude-tool',
      input: { hook_event_name: 'PermissionRequest', session_id: 'claude-session', tool_use_id: 'claude-tool', tool_name: 'Bash', tool_input: { command: 'git status' } }
    },
    {
      name: 'Codex',
      script: 'codex-hook.mjs',
      provider: 'codex',
      sessionId: 'codex-session',
      requestId: 'codex-turn',
      input: { hook_event_name: 'PermissionRequest', session_id: 'codex-session', turn_id: 'codex-turn', tool_name: 'Bash', tool_input: { command: 'git status' } }
    }
  ])('returns an allow decision through the $name hook', async adapter => {
    const { connection, connectionPath } = await createHub(cleanups);
    const child = runHook(adapter.script, adapter.input, connectionPath);
    const done = collect(child);
    await eventuallyReply(connection, { provider: adapter.provider, sessionId: adapter.sessionId, requestId: adapter.requestId, actionId: 'allow' });
    const result = await done;
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  });

  it('uses the current OpenCode permission.reply SDK and offers once/always/reject', async () => {
    const { connection, connectionPath } = await createHub(cleanups);
    const previous = process.env.AGENT_LIGHT_CONNECTION;
    process.env.AGENT_LIGHT_CONNECTION = connectionPath;
    cleanups.push(() => { if (previous === undefined) delete process.env.AGENT_LIGHT_CONNECTION; else process.env.AGENT_LIGHT_CONNECTION = previous; });
    // The shipped adapter is plain ESM and intentionally has no TypeScript declaration file.
    // @ts-expect-error importing the runtime adapter is part of this integration test
    const pluginModule = await import('../../adapters/opencode-plugin.mjs') as { AgentLightPlugin: (context: unknown) => Promise<{ event(input: unknown): Promise<void> }> };
    expect(Object.keys(pluginModule)).toEqual(['AgentLightPlugin']);
    const { AgentLightPlugin } = pluginModule;
    const replies: unknown[] = [];
    const plugin = await AgentLightPlugin({ directory: '/tmp/project', client: { permission: { reply: async (value: unknown) => { replies.push(value); } } } });
    const handling = plugin.event({ event: { type: 'permission.asked', properties: { id: 'permission-1', sessionID: 'open-session', permission: 'bash', patterns: ['git status*'] } } });
    await eventuallyReply(connection, { provider: 'opencode', sessionId: 'open-session', requestId: 'permission-1', actionId: 'always' });
    await handling;
    expect(replies).toEqual([{ requestID: 'permission-1', reply: 'always' }]);
  });

  it('reports Cursor lifecycle events without attempting to answer permissions', async () => {
    const { connection, connectionPath } = await createHub(cleanups);
    const result = await collect(runHook('cursor-hook.mjs', { hook_event_name: 'stop', conversation_id: 'cursor-session', workspace_roots: ['/tmp/project'] }, connectionPath));
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    const snapshot = await currentSnapshot(connection);
    expect(snapshot.sessions).toContainEqual(expect.objectContaining({ provider: 'cursor', sessionId: 'cursor-session', phase: 'completed', workspace: '/tmp/project' }));
  });

  it('rejects a connection file that points outside loopback', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-light-external-'));
    const path = join(directory, 'connection.json');
    writeFileSync(path, JSON.stringify({ endpoint: 'https://example.com', token: 'secret', protocol: 'agent-light/1' }));
    const previous = process.env.AGENT_LIGHT_CONNECTION;
    process.env.AGENT_LIGHT_CONNECTION = path;
    try {
      // The adapter connection helper is shipped as plain ESM without TypeScript declarations.
      // @ts-expect-error importing the runtime adapter is part of this integration test
      const { readConnection } = await import('../../adapters/connection.mjs');
      await expect(readConnection()).rejects.toThrow(/loopback/);
    } finally {
      if (previous === undefined) delete process.env.AGENT_LIGHT_CONNECTION; else process.env.AGENT_LIGHT_CONNECTION = previous;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

async function createHub(cleanups: Array<() => void>): Promise<{ connection: AgentHubConnection; connectionPath: string }> {
  const directory = mkdtempSync(join(tmpdir(), 'agent-light-adapter-'));
  const hub = new AgentHub(directory);
  const connection = await hub.start();
  cleanups.push(() => { hub.stop(); rmSync(directory, { recursive: true, force: true }); });
  return { connection, connectionPath: join(directory, 'connection.json') };
}

function runHook(script: string, input: unknown, connectionPath: string): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [resolve('adapters', script)], { env: { ...process.env, AGENT_LIGHT_CONNECTION: connectionPath }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(JSON.stringify(input));
  return child;
}

function collect(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Adapter did not exit')); }, 5_000);
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', code => { clearTimeout(timer); resolvePromise({ code, stdout, stderr }); });
  });
}

async function eventuallyReply(connection: AgentHubConnection, body: unknown): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${connection.endpoint}/v1/reply`, { method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.status === 200) return;
    if (response.status !== 409) throw new Error(`Unexpected reply status: ${response.status}`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
  throw new Error('Adapter never published its permission request');
}

async function currentSnapshot(connection: AgentHubConnection): Promise<{ sessions: Array<Record<string, unknown>> }> {
  const response = await fetch(`${connection.endpoint}/events?token=${connection.token}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No SSE body');
  const decoder = new TextDecoder(); let buffer = '';
  for (;;) {
    const next = await reader.read();
    if (next.done) throw new Error('SSE stream ended');
    buffer += decoder.decode(next.value, { stream: true });
    const match = buffer.match(/data: (.+?)\n\n/s);
    if (match) { await reader.cancel(); return JSON.parse(match[1]) as { sessions: Array<Record<string, unknown>> }; }
  }
}
