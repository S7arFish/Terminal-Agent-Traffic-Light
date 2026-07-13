#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readStdinJson, sendAgentEvent, waitForDecision } from './connection.mjs';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await runCodexHook();

export async function runCodexHook() {
  const input = await readStdinJson().catch(() => undefined);
  if (!input || typeof input !== 'object') return;
  const hook = String(input.hook_event_name ?? 'Unknown');
  const sessionId = boundedString(input.session_id, String(process.ppid), 200);
  const requestId = hook === 'PermissionRequest'
    ? boundedString(input.tool_use_id ?? input.request_id ?? input.turn_id, randomUUID(), 300)
    : undefined;

  try {
    await sendAgentEvent(toCodexEvent(input, hook, sessionId, requestId));
    if (hook !== 'PermissionRequest' || !requestId) return;
    const action = await waitForDecision('codex', sessionId, requestId);
    if (action === 'allow') {
      writeDecision('allow');
    } else if (action === 'deny') {
      writeDecision('deny', 'Denied from Agent Light');
    }
  } catch {
    // Observability and shortcut replies must fail open when Agent Light is closed.
  }
}

export function toCodexEvent(value, hookEventName, sessionId, requestId) {
  return {
    version: 1,
    provider: 'codex',
    sessionId,
    requestId,
    phase: hookEventName === 'PermissionRequest' ? 'waiting' : hookEventName === 'Stop' ? 'completed' : 'running',
    title: codexTitle(hookEventName),
    message: codexMessage(value, hookEventName),
    workspace: typeof value.cwd === 'string' ? value.cwd : undefined,
    actions: hookEventName === 'PermissionRequest' ? [
      { id: 'allow', label: '允许这次操作', kind: 'primary' },
      { id: 'deny', label: '拒绝', kind: 'destructive' }
    ] : undefined,
    occurredAtEpochMs: Date.now()
  };
}

function writeDecision(behavior, message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior, ...(message ? { message } : {}) }
    }
  }));
}

function codexTitle(hook) {
  if (hook === 'PermissionRequest') return 'Codex 正在请求权限';
  if (hook === 'Stop') return 'Codex 已完成这一轮';
  if (hook === 'SubagentStart') return 'Codex 子 Agent 正在工作';
  if (hook === 'SubagentStop') return 'Codex 子 Agent 已返回';
  return 'Codex 正在工作';
}

function codexMessage(value, hook) {
  if (hook === 'PermissionRequest' || hook === 'PreToolUse' || hook === 'PostToolUse') {
    const tool = typeof value.tool_name === 'string' ? value.tool_name : '工具';
    const input = value.tool_input && typeof value.tool_input === 'object' ? value.tool_input : {};
    const detail = input.description ?? input.command ?? input.file_path ?? input.path;
    if (detail) return `${tool}\n${String(detail)}`.slice(0, 20_000);
    const serialized = text(input);
    return serialized && serialized !== '{}' ? `${tool}\n${serialized}`.slice(0, 20_000) : `Codex 正在使用 ${tool}`;
  }
  if (hook === 'UserPromptSubmit' && typeof value.prompt === 'string') return value.prompt.slice(0, 20_000);
  return undefined;
}

function boundedString(value, fallback, limit) { const result = typeof value === 'string' && value ? value : fallback; return result.slice(0, limit); }
function text(value) { try { return value ? JSON.stringify(value, null, 2) : undefined; } catch { return undefined; } }
