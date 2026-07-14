import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('adapter installer integration', () => {
  it('preserves existing configs and stays idempotent in a temporary HOME', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-light-install-'));
    try {
      const claudeOriginal = seedJson(home, '.claude/settings.json', { keep: true, hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'existing-claude-hook' }] }, { hooks: [{ type: 'command', command: oldAgentCommand('claude-code-hook.mjs') }] }] } });
      const codexOriginal = seedJson(home, '.codex/hooks.json', { keep: true, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'existing-codex-hook' }] }, { hooks: [{ type: 'command', command: oldAgentCommand('codex-hook.mjs') }] }] } });
      const cursorOriginal = seedJson(home, '.cursor/hooks.json', { version: 1, keep: true, hooks: { stop: [{ type: 'command', command: 'existing-cursor-hook' }, { type: 'command', command: oldAgentCommand('cursor-hook.mjs') }] } });
      const hermesOriginal = seedText(home, '.hermes/config.yaml', `# preserved comment\nmodel: test\nhooks:\n  post_tool_call:\n    - command: "existing-hermes-hook"\n      timeout: 3\n    - command: ${JSON.stringify(oldAgentCommand('hermes-hook.mjs'))}\n      timeout: 10\nother: true\n`);
      seedJson(home, '.config/opencode/package.json', { type: 'module' });
      seedText(home, '.config/opencode/plugins/agent-light.mjs', 'legacy plugin');
      seedText(home, '.config/opencode/plugins/connection.mjs', 'user-owned helper');

      for (let run = 0; run < 2; run += 1) execFileSync(process.execPath, [resolve('scripts/install-agent-adapters.mjs'), 'all'], { env: { ...process.env, HOME: home }, stdio: 'pipe' });

      const claude = readJson(home, '.claude/settings.json');
      const codex = readJson(home, '.codex/hooks.json');
      const cursor = readJson(home, '.cursor/hooks.json');
      expect(claude.keep).toBe(true);
      expect(codex.keep).toBe(true);
      expect(cursor.keep).toBe(true);
      expect(claude.hooks.SessionStart).toHaveLength(2);
      expect(codex.hooks.Stop).toHaveLength(2);
      expect(cursor.hooks.stop).toHaveLength(2);
      expect(JSON.stringify(claude)).not.toContain('/Old Agent Light.app');
      expect(JSON.stringify(codex)).not.toContain('/Old Agent Light.app');
      expect(JSON.stringify(cursor)).not.toContain('/Old Agent Light.app');
      expect(agentLightNestedCount(claude)).toBe(7);
      expect(agentLightNestedCount(codex)).toBe(8);
      expect(agentLightCursorCount(cursor)).toBe(8);

      const hermes = readFileSync(join(home, '.hermes/config.yaml'), 'utf8');
      expect(hermes).toContain('# preserved comment');
      expect(hermes).toContain('existing-hermes-hook');
      expect(hermes).toContain('other: true');
      expect(hermes).not.toContain('/Old Agent Light.app');
      expect(hermes.match(/Agent Light\/adapters\/hermes-hook\.mjs/g)).toHaveLength(11);
      expect(readFileSync(join(home, '.config/opencode/plugins/agent-light.js'), 'utf8')).toContain('AgentLightPlugin');
      expect(readFileSync(join(home, '.config/opencode/plugins/agent-light.js'), 'utf8')).toContain('../agent-light/connection.mjs');
      expect(readFileSync(join(home, '.config/opencode/agent-light/connection.mjs'), 'utf8')).toContain('sendAgentEvent');
      expect(readFileSync(join(home, '.config/opencode/plugins/connection.mjs'), 'utf8')).toBe('user-owned helper');
      const installedOpenCodePlugin = await import(`${pathToFileURL(join(home, '.config/opencode/plugins/agent-light.js')).href}?test=${Date.now()}`);
      expect(typeof installedOpenCodePlugin.AgentLightPlugin).toBe('function');
      expect(() => statSync(join(home, '.config/opencode/plugins/agent-light.mjs'))).toThrow();
      expect(statSync(join(home, '.codex/hooks.json')).mode & 0o777).toBe(0o600);
      expect(readFileSync(join(home, '.claude/settings.json.agent-light.bak'), 'utf8')).toBe(claudeOriginal);
      expect(readFileSync(join(home, '.codex/hooks.json.agent-light.bak'), 'utf8')).toBe(codexOriginal);
      expect(readFileSync(join(home, '.cursor/hooks.json.agent-light.bak'), 'utf8')).toBe(cursorOriginal);
      expect(readFileSync(join(home, '.hermes/config.yaml.agent-light.bak'), 'utf8')).toBe(hermesOriginal);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

function seedJson(home: string, path: string, value: unknown): string { return seedText(home, path, `${JSON.stringify(value, null, 2)}\n`); }
function seedText(home: string, path: string, value: string): string { const target = join(home, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, value, { mode: 0o600 }); return value; }
function readJson(home: string, path: string): any { return JSON.parse(readFileSync(join(home, path), 'utf8')); }
function agentLightNestedCount(value: any): number { return Object.values(value.hooks).flatMap((entries: any) => entries).flatMap((entry: any) => entry.hooks ?? []).filter((hook: any) => String(hook.command).includes('Agent Light')).length; }
function agentLightCursorCount(value: any): number { return Object.values(value.hooks).flatMap((entries: any) => entries).filter((hook: any) => String(hook.command).includes('Agent Light')).length; }
function oldAgentCommand(adapter: string): string { return `/usr/bin/env ELECTRON_RUN_AS_NODE=1 "/Applications/Old Agent Light.app/Contents/MacOS/Agent Light" "/Users/test/Library/Application Support/Agent Light/adapters/${adapter}"`; }
