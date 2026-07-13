#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readStdinJson, sendAgentEvent, waitForDecision } from './connection.mjs';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await runClaudeHook();

export async function runClaudeHook() {
  const input = await readStdinJson().catch(() => undefined);
  if (!input || typeof input !== 'object') return;
  const hook = String(input.hook_event_name ?? 'Unknown');
  const sessionId = String(input.session_id ?? process.ppid).slice(0, 200);
  const requestId = hook === 'PermissionRequest' ? String(input.tool_use_id ?? input.request_id ?? randomUUID()).slice(0, 300) : undefined;
  try {
    await sendAgentEvent(toEvent(input, hook, sessionId, requestId));
    if (hook === 'PermissionRequest') {
      const action = await waitForDecision('claude-code', sessionId, requestId);
      if (action === 'allow') {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }));
      } else if (action === 'deny') {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Denied from Agent Light' } } }));
      }
    }
  } catch {
    // Monitoring must never prevent Claude Code from continuing normally.
  }
}

function toEvent(value, hookEventName, id, requestId) {
  const phase = phaseFor(hookEventName, value.notification_type);
  const message = permissionMessage(value, hookEventName);
  return {
    version: 1,
    provider: 'claude-code',
    sessionId: id,
    requestId,
    phase,
    title: titleFor(hookEventName, value.notification_type),
    message,
    workspace: typeof value.cwd === 'string' ? value.cwd : undefined,
    actions: hookEventName === 'PermissionRequest' ? [
      { id: 'allow', label: '允许这次操作', kind: 'primary' },
      { id: 'deny', label: '拒绝', kind: 'destructive' }
    ] : undefined,
    occurredAtEpochMs: Date.now()
  };
}

function phaseFor(hook, notificationType) {
  if (hook === 'PermissionRequest' || (hook === 'Notification' && ['permission_prompt', 'idle_prompt', 'elicitation_dialog'].includes(String(notificationType)))) return 'waiting';
  if (hook === 'StopFailure') return 'failed';
  if (hook === 'Stop' || hook === 'SessionEnd') return 'completed';
  if (hook === 'Notification') return 'idle';
  return 'running';
}
function titleFor(hook, notificationType) {
  if (hook === 'PermissionRequest') return 'Claude 正在请求权限';
  if (hook === 'Notification' && notificationType === 'idle_prompt') return 'Claude 正在等待输入';
  if (hook === 'Stop') return 'Claude 已完成这一轮';
  if (hook === 'StopFailure') return 'Claude 执行失败';
  return 'Claude Code';
}
function permissionMessage(value, hook) {
  if (hook === 'PermissionRequest') {
    const tool = typeof value.tool_name === 'string' ? value.tool_name : '工具';
    const input = value.tool_input && typeof value.tool_input === 'object' ? value.tool_input : {};
    const detail = input.command ?? input.description ?? input.file_path ?? input.path;
    return (detail ? `${tool}\n${String(detail)}` : `Claude 请求使用 ${tool}`).slice(0, 20_000);
  }
  if (typeof value.message === 'string') return value.message.slice(0, 20_000);
  if (typeof value.last_assistant_message === 'string') return value.last_assistant_message.slice(0, 20_000);
  return undefined;
}
