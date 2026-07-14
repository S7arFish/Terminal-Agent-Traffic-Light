import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoConnectInstalledAgents } from '../../desktop/agentAutoConnector';

describe('agent auto connector integration', () => {
  it('discovers Codex and invokes the real installer in an isolated HOME', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-light-auto-install-'));
    try {
      mkdirSync(join(home, '.codex'), { recursive: true });

      const result = await autoConnectInstalledAgents({
        home,
        path: '',
        applicationDirectories: [],
        installerPath: resolve('scripts/install-agent-adapters.mjs'),
        executablePath: process.execPath,
        userDataPath: join(home, 'user-data'),
        env: { HOME: home }
      });

      expect(result.connected).toEqual(['codex']);
      const hooks = JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf8'));
      expect(Object.keys(hooks.hooks)).toContain('PermissionRequest');
      expect(JSON.stringify(hooks)).toContain('Agent Light/adapters/codex-hook.mjs');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
