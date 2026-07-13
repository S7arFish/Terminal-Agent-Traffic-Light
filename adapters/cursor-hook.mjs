#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { readStdinJson, sendAgentEvent } from './connection.mjs';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await runCursorHook();

export async function runCursorHook() {
  const input = await readStdinJson().catch(() => undefined);
  if (!input || typeof input !== 'object') return;
  try {
    await sendAgentEvent(toCursorEvent(input));
  } catch {
    // Cursor must continue normally when the desktop app is not running.
  }
}

export function toCursorEvent(value) {
  const hook = String(value.hook_event_name ?? 'unknown');
  const sessionId = String(value.conversation_id ?? value.session_id ?? value.generation_id ?? process.ppid).slice(0, 200);
  return {
    version: 1,
    provider: 'cursor',
    sessionId,
    phase: cursorPhase(hook, value),
    title: cursorTitle(hook, value),
    message: cursorMessage(hook, value),
    workspace: cursorWorkspace(value),
    occurredAtEpochMs: Date.now()
  };
}

function cursorPhase(hook, value) {
  if (hook === 'sessionEnd') {
    const result = String(value.final_status ?? value.reason ?? '').toLowerCase();
    return result.includes('error') || result.includes('fail') || value.error_message ? 'failed' : 'completed';
  }
  if (hook === 'stop') return 'completed';
  return 'running';
}

function cursorTitle(hook, value) {
  if (hook === 'sessionEnd' && cursorPhase(hook, value) === 'failed') return 'Cursor 会话异常结束';
  if (hook === 'sessionEnd') return 'Cursor 会话已结束';
  if (hook === 'stop') return 'Cursor 已完成这一轮';
  if (hook === 'postToolUseFailure') return 'Cursor 正在处理工具错误';
  if (hook === 'sessionStart') return 'Cursor 会话已开始';
  return 'Cursor 正在工作';
}

function cursorMessage(hook, value) {
  const candidate = hook === 'postToolUseFailure'
    ? value.error_message
    : value.tool_input ?? value.command ?? value.text ?? value.prompt ?? value.user_message;
  if (typeof candidate === 'string') return candidate.slice(0, 20_000);
  try { return candidate ? JSON.stringify(candidate, null, 2).slice(0, 20_000) : undefined; } catch { return undefined; }
}

function cursorWorkspace(value) {
  if (Array.isArray(value.workspace_roots) && typeof value.workspace_roots[0] === 'string') return value.workspace_roots[0];
  return process.env.CURSOR_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR;
}
