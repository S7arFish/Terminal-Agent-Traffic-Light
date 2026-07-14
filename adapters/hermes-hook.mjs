#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { readStdinJson, sendAgentEvent } from './connection.mjs';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await runHermesHook();

export async function runHermesHook() {
  const input = await readStdinJson().catch(() => ({}));
  const hook = String(process.argv[2] ?? input.hook_event_name ?? input.event ?? 'pre_llm_call');
  try {
    await sendAgentEvent(toHermesEvent(input, hook));
    process.stdout.write('{}\n');
  } catch {
    // Hermes continues normally when the desktop app is not running.
  }
}

export function toHermesEvent(input, hook) {
  const sessionId = String(input.session_id ?? input.sessionId ?? input.conversation_id ?? process.ppid).slice(0, 200);
  const extra = input.extra && typeof input.extra === 'object' ? input.extra : {};
  return {
    version: 1,
    provider: 'hermes',
    sessionId,
    phase: hermesPhase(hook),
    title: hermesTitle(hook),
    message: text(input.message ?? input.detail ?? input.tool_input ?? extra.command ?? extra.description),
    workspace: typeof input.cwd === 'string' ? input.cwd : undefined,
    occurredAtEpochMs: Date.now()
  };
}

function hermesPhase(hook) {
  if (hook === 'pre_approval_request') return 'waiting';
  if (['on_session_end', 'on_session_finalize', 'on_session_reset'].includes(hook)) return 'completed';
  return 'running';
}

function hermesTitle(hook) {
  if (hook === 'pre_approval_request') return 'Hermes 正在等待权限确认';
  if (hook === 'post_approval_response') return 'Hermes 已收到权限选择';
  if (['on_session_end', 'on_session_finalize', 'on_session_reset'].includes(hook)) return 'Hermes 会话已结束';
  if (hook === 'subagent_start') return 'Hermes 子 Agent 正在工作';
  if (hook === 'subagent_stop') return 'Hermes 子 Agent 已返回';
  return 'Hermes 正在工作';
}

function text(value) { if (typeof value === 'string') return value.slice(0, 20_000); try { return value ? JSON.stringify(value, null, 2).slice(0, 20_000) : undefined; } catch { return undefined; } }
