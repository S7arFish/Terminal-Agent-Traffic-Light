import { sendAgentEvent, waitForDecision } from './connection.mjs';

export const AgentLightPlugin = async ({ directory, client }) => ({
  event: async ({ event }) => {
    const mapped = mapOpenCodeEvent(event, directory);
    if (!mapped) return;
    try {
      await sendAgentEvent(mapped);
      if (event?.type !== 'permission.asked' || !mapped.requestId) return;
      const action = await waitForDecision('opencode', mapped.sessionId, mapped.requestId);
      if (!['once', 'always', 'reject'].includes(action)) return;
      await replyPermission(client, mapped.sessionId, mapped.requestId, action);
      await sendAgentEvent({
        version: 1,
        provider: 'opencode',
        sessionId: mapped.sessionId,
        phase: 'running',
        title: action === 'reject' ? 'OpenCode 已收到拒绝' : 'OpenCode 已获得授权',
        workspace: directory,
        occurredAtEpochMs: Date.now()
      });
    } catch {
      // OpenCode's own permission UI remains available when Agent Light is closed.
    }
  }
});

function mapOpenCodeEvent(event, workspace) {
  const type = String(event?.type ?? '');
  const properties = event?.properties ?? {};
  const sessionId = String(properties.sessionID ?? properties.sessionId ?? event?.sessionID ?? 'default').slice(0, 200);
  const base = { version: 1, provider: 'opencode', sessionId, workspace, occurredAtEpochMs: Date.now() };
  if (type === 'permission.asked') {
    const requestId = String(properties.id ?? properties.requestID ?? properties.requestId ?? '').slice(0, 300);
    if (!requestId) return undefined;
    return {
      ...base,
      requestId,
      phase: 'waiting',
      title: 'OpenCode 正在请求权限',
      message: permissionText(properties),
      actions: [
        { id: 'once', label: '仅允许这次', kind: 'primary' },
        { id: 'always', label: '本次会话始终允许', kind: 'secondary' },
        { id: 'reject', label: '拒绝', kind: 'destructive' }
      ]
    };
  }
  if (type === 'permission.replied') return { ...base, phase: 'running', title: 'OpenCode 正在继续工作' };
  if (type === 'session.error') return { ...base, phase: 'failed', title: 'OpenCode 会话出错', message: text(properties.error) };
  if (type === 'session.idle') return { ...base, phase: 'completed', title: 'OpenCode 已完成这一轮' };
  if (type === 'session.status') return { ...base, phase: statusPhase(properties), title: 'OpenCode 正在工作' };
  if (['message.updated', 'message.part.updated', 'tool.execute.before', 'tool.execute.after'].includes(type)) return { ...base, phase: 'running', title: 'OpenCode 正在工作' };
  return undefined;
}

async function replyPermission(client, sessionId, requestId, reply) {
  if (typeof client?.permission?.reply === 'function') {
    await client.permission.reply({ requestID: requestId, reply });
    return;
  }
  if (typeof client?.permissions?.reply === 'function') {
    await client.permissions.reply({ sessionID: sessionId, requestID: requestId, reply });
    return;
  }
  throw new Error('OpenCode permission reply API is unavailable');
}

function statusPhase(properties) {
  const status = String(properties?.status?.type ?? properties?.status ?? 'running');
  return status === 'idle' ? 'completed' : status === 'error' ? 'failed' : 'running';
}

function permissionText(properties) {
  const permission = typeof properties.permission === 'string' ? properties.permission : '权限';
  const patterns = Array.isArray(properties.patterns) ? properties.patterns.filter(value => typeof value === 'string').join('\n') : '';
  const detail = text(properties.metadata ?? properties.tool ?? properties.title);
  return [`${permission}`, patterns, detail].filter(Boolean).join('\n').slice(0, 20_000) || 'OpenCode 正在等待你的确认';
}

function text(value) { if (typeof value === 'string') return value; try { return value ? JSON.stringify(value, null, 2) : undefined; } catch { return undefined; } }
