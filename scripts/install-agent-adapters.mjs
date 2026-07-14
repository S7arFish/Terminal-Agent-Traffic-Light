import { basename, dirname, join } from 'node:path';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const support = join(homedir(), 'Library', 'Application Support', 'Agent Light', 'adapters');
const adapterFiles = ['connection.mjs', 'claude-code-hook.mjs', 'codex-hook.mjs', 'cursor-hook.mjs', 'opencode-plugin.mjs', 'hermes-hook.mjs'];
const providers = new Set(['all', 'claude', 'codex', 'cursor', 'opencode', 'hermes']);
const provider = process.argv[2] ?? 'all';

if (!providers.has(provider)) {
  process.stderr.write(`Unknown provider: ${provider}\nUse one of: ${[...providers].join(', ')}\n`);
  process.exitCode = 2;
} else {
  mkdirSync(support, { recursive: true });
  for (const file of adapterFiles) copyIfChanged(join(root, 'adapters', file), join(support, file));
  if (provider === 'all' || provider === 'claude') installClaude();
  if (provider === 'all' || provider === 'codex') installCodex();
  if (provider === 'all' || provider === 'cursor') installCursor();
  if (provider === 'all' || provider === 'opencode') installOpenCode();
  if (provider === 'all' || provider === 'hermes') installHermes();
}

function installClaude() {
  const path = join(homedir(), '.claude', 'settings.json');
  const settings = readJson(path);
  const hooks = hooksObject(settings, path);
  const command = nodeCommand(join(support, 'claude-code-hook.mjs'));
  for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure', 'SessionEnd']) addNestedHook(hooks, event, command, path, { adapter: 'claude-code-hook.mjs' });
  addNestedHook(hooks, 'PermissionRequest', command, path, { adapter: 'claude-code-hook.mjs', timeout: 570, statusMessage: 'Waiting for Agent Light' });
  addNestedHook(hooks, 'Notification', command, path, { adapter: 'claude-code-hook.mjs', matcher: 'permission_prompt|idle_prompt|elicitation_dialog' });
  writeJson(path, settings, true);
  process.stdout.write(`Claude Code adapter installed in ${path}\n`);
}

function installCodex() {
  const path = join(homedir(), '.codex', 'hooks.json');
  const settings = readJson(path);
  const hooks = hooksObject(settings, path);
  const command = nodeCommand(join(support, 'codex-hook.mjs'));
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop']) addNestedHook(hooks, event, command, path, { adapter: 'codex-hook.mjs' });
  addNestedHook(hooks, 'PermissionRequest', command, path, { adapter: 'codex-hook.mjs', timeout: 570, statusMessage: 'Waiting for Agent Light' });
  writeJson(path, settings, true);
  process.stdout.write(`Codex adapter installed in ${path}\nReview and trust it from Codex with /hooks after restarting Codex.\n`);
}

function installCursor() {
  const path = join(homedir(), '.cursor', 'hooks.json');
  const settings = readJson(path);
  if (settings.version === undefined) settings.version = 1;
  const hooks = hooksObject(settings, path);
  const command = nodeCommand(join(support, 'cursor-hook.mjs'));
  for (const event of ['sessionStart', 'beforeSubmitPrompt', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'afterAgentResponse', 'stop', 'sessionEnd']) addCursorHook(hooks, event, command, path, 'cursor-hook.mjs');
  writeJson(path, settings, true);
  process.stdout.write(`Cursor adapter installed in ${path}\n`);
}

function installOpenCode() {
  const configRoot = join(homedir(), '.config', 'opencode');
  const target = join(configRoot, 'plugins', 'agent-light.js');
  const helper = join(configRoot, 'agent-light', 'connection.mjs');
  const legacyTarget = join(dirname(target), 'agent-light.mjs');
  const legacyHelper = join(dirname(target), 'connection.mjs');
  mkdirSync(dirname(target), { recursive: true });
  const plugin = readFileSync(join(support, 'opencode-plugin.mjs'), 'utf8').replace("'./connection.mjs'", "'../agent-light/connection.mjs'");
  writeAtomic(target, plugin);
  copyIfChanged(join(support, 'connection.mjs'), helper);
  if (existsSync(legacyTarget)) unlinkSync(legacyTarget);
  if (existsSync(legacyHelper) && readFileSync(legacyHelper).equals(readFileSync(join(support, 'connection.mjs')))) unlinkSync(legacyHelper);
  process.stdout.write(`OpenCode adapter installed in ${target}\n`);
}

function installHermes() {
  const path = join(homedir(), '.hermes', 'config.yaml');
  const command = nodeCommand(join(support, 'hermes-hook.mjs'));
  const events = ['on_session_start', 'pre_llm_call', 'pre_tool_call', 'post_tool_call', 'pre_approval_request', 'post_approval_response', 'on_session_end', 'on_session_finalize', 'on_session_reset', 'subagent_start', 'subagent_stop'];
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeAtomic(path, mergeHermesHooks(existing, events, command), true);
  process.stdout.write(`Hermes adapter installed in ${path}\nApprove the new shell hooks on first use, then verify them with: hermes hooks doctor\n`);
}

function hooksObject(settings, path) {
  if (!isObject(settings)) throw new Error(`${path} must contain a JSON object`);
  settings.hooks ??= {};
  if (!isObject(settings.hooks)) throw new Error(`${path} has a non-object hooks value; refusing to overwrite it`);
  return settings.hooks;
}

function addNestedHook(hooks, event, command, path, options = {}) {
  hooks[event] ??= [];
  if (!Array.isArray(hooks[event])) throw new Error(`${path} has a non-array hooks.${event} value; refusing to overwrite it`);
  const existing = hooks[event].flatMap(entry => Array.isArray(entry?.hooks) ? entry.hooks : []).find(hook => isAgentLightCommand(hook?.command, options.adapter));
  if (existing) {
    existing.command = command;
    if (options.timeout) existing.timeout = options.timeout;
    if (options.statusMessage) existing.statusMessage = options.statusMessage;
    return;
  }
  const handler = { type: 'command', command, ...(options.timeout ? { timeout: options.timeout } : {}), ...(options.statusMessage ? { statusMessage: options.statusMessage } : {}) };
  hooks[event].push({ ...(options.matcher ? { matcher: options.matcher } : {}), hooks: [handler] });
}

function addCursorHook(hooks, event, command, path, adapter) {
  hooks[event] ??= [];
  if (!Array.isArray(hooks[event])) throw new Error(`${path} has a non-array hooks.${event} value; refusing to overwrite it`);
  const existing = hooks[event].find(entry => isAgentLightCommand(entry?.command, adapter));
  if (existing) { existing.command = command; existing.timeout = 10; return; }
  hooks[event].push({ type: 'command', command, timeout: 10 });
}

function mergeHermesHooks(source, events, command) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source ? source.split(/\r?\n/) : [];
  if (lines.at(-1) === '') lines.pop();
  let hooksIndex = lines.findIndex(line => /^hooks:\s*(?:#.*)?$/.test(line) || /^hooks:\s*\{\s*\}\s*(?:#.*)?$/.test(line));
  if (hooksIndex < 0) {
    const unsupported = lines.find(line => /^hooks\s*:/.test(line));
    if (unsupported) throw new Error('~/.hermes/config.yaml uses an inline hooks value that Agent Light cannot merge safely');
    if (lines.length && lines.at(-1)?.trim()) lines.push('');
    hooksIndex = lines.length;
    lines.push('hooks:');
  } else if (/^hooks:\s*\{\s*\}/.test(lines[hooksIndex])) {
    lines[hooksIndex] = 'hooks:';
  }

  for (const event of events) addHermesHook(lines, hooksIndex, event, command);
  return `${lines.join(eol)}${eol}`;
}

function addHermesHook(lines, hooksIndex, event, command) {
  let hooksEnd = blockEnd(lines, hooksIndex, 0);
  let eventIndex = -1;
  for (let index = hooksIndex + 1; index < hooksEnd; index += 1) {
    const match = lines[index].match(/^ {2}([A-Za-z0-9_]+):\s*(.*)$/);
    if (match?.[1] === event) { eventIndex = index; break; }
  }
  if (eventIndex < 0) {
    lines.splice(hooksEnd, 0, `  ${event}:`, `    - command: ${JSON.stringify(command)}`, '      timeout: 10');
    return;
  }

  const inline = lines[eventIndex].match(/^ {2}[A-Za-z0-9_]+:\s*(.*)$/)?.[1]?.trim() ?? '';
  if (inline === '[]') lines[eventIndex] = `  ${event}:`;
  else if (inline && !inline.startsWith('#')) throw new Error(`~/.hermes/config.yaml uses an inline hooks.${event} value that Agent Light cannot merge safely`);
  hooksEnd = blockEnd(lines, hooksIndex, 0);
  const eventEnd = Math.min(blockEnd(lines, eventIndex, 2), hooksEnd);
  const commandLine = `- command: ${JSON.stringify(command)}`;
  const existingAgentLight = lines.slice(eventIndex + 1, eventEnd).findIndex(line => isAgentLightCommand(line, 'hermes-hook.mjs'));
  if (existingAgentLight >= 0) { lines[eventIndex + 1 + existingAgentLight] = `    ${commandLine}`; return; }
  lines.splice(eventEnd, 0, `    ${commandLine}`, '      timeout: 10');
}

function blockEnd(lines, start, indent) {
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const leading = line.match(/^ */)?.[0].length ?? 0;
    if (leading <= indent) return index;
  }
  return lines.length;
}

function nodeCommand(path) {
  if (process.versions.electron) return `/usr/bin/env ELECTRON_RUN_AS_NODE=1 ${JSON.stringify(process.execPath)} ${JSON.stringify(path)}`;
  return `/usr/bin/env node ${JSON.stringify(path)}`;
}
function isAgentLightCommand(value, adapter) { return typeof value === 'string' && typeof adapter === 'string' && value.includes(`Agent Light/adapters/${adapter}`); }
function readJson(path) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}; }
  catch (error) { throw new Error(`Cannot parse ${path}: ${error.message}`); }
}
function writeJson(path, value, backup = false) { writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`, backup); }
function writeAtomic(path, contents, backup = false) {
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  if (existsSync(path) && readFileSync(path).equals(buffer)) return false;
  mkdirSync(dirname(path), { recursive: true });
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600;
  if (backup) backupOnce(path, mode);
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, buffer, { mode });
    renameSync(temporary, path);
    chmodSync(path, mode);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return true;
}
function backupOnce(path, mode) {
  if (!existsSync(path)) return;
  const backup = `${path}.agent-light.bak`;
  if (existsSync(backup)) return;
  copyFileSync(path, backup);
  chmodSync(backup, mode);
}
function copyIfChanged(source, target) {
  return writeAtomic(target, readFileSync(source));
}
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
