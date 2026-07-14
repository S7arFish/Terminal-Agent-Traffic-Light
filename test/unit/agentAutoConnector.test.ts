import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { autoConnectInstalledAgents, detectInstalledAgents } from '../../desktop/agentAutoConnector';

describe('agent auto connector', () => {
  it('detects config, executable, and application evidence without invoking a login shell', () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-light-detect-'));
    const applications = join(home, 'Applications');
    const binaries = join(home, 'bin');
    try {
      mkdirSync(join(home, '.claude'), { recursive: true });
      mkdirSync(join(applications, 'Cursor.app'), { recursive: true });
      mkdirSync(binaries, { recursive: true });
      writeFileSync(join(binaries, 'opencode'), '');

      const detected = detectInstalledAgents({ home, path: binaries, applicationDirectories: [applications] });

      expect(detected.map(agent => agent.provider)).toEqual(['claude', 'cursor', 'opencode']);
      expect(detected.find(agent => agent.provider === 'cursor')?.evidence).toContain(join(applications, 'Cursor.app'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('installs every detected provider but only reports each one as new once', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-light-connect-'));
    const userDataPath = join(home, 'user-data');
    const runInstaller = vi.fn(async () => undefined);
    try {
      mkdirSync(join(home, '.codex'), { recursive: true });
      mkdirSync(join(home, '.hermes'), { recursive: true });
      const options = { home, path: '', applicationDirectories: [], installerPath: '/unused/installer.mjs', executablePath: '/unused/electron', userDataPath, runInstaller };

      const first = await autoConnectInstalledAgents(options);
      const second = await autoConnectInstalledAgents(options);

      expect(first.connected).toEqual(['codex', 'hermes']);
      expect(first.newlyConnected).toEqual(['codex', 'hermes']);
      expect(second.newlyConnected).toEqual([]);
      expect(runInstaller).toHaveBeenCalledTimes(4);
      expect(JSON.parse(readFileSync(join(userDataPath, 'auto-connect.json'), 'utf8')).connectedProviders).toEqual(['codex', 'hermes']);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('reports repaired connections again when the app executable moves', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-light-connect-moved-'));
    const runInstaller = vi.fn(async () => undefined);
    try {
      mkdirSync(join(home, '.codex'), { recursive: true });
      const common = { home, path: '', applicationDirectories: [], installerPath: '/unused/installer.mjs', userDataPath: join(home, 'user-data'), runInstaller };
      await autoConnectInstalledAgents({ ...common, executablePath: '/Applications/Agent Light.app/Contents/MacOS/Agent Light' });

      const repaired = await autoConnectInstalledAgents({ ...common, executablePath: '/Users/test/Applications/Agent Light.app/Contents/MacOS/Agent Light' });

      expect(repaired.newlyConnected).toEqual(['codex']);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('does not mark a failed provider as connected', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-light-connect-failure-'));
    try {
      mkdirSync(join(home, '.cursor'), { recursive: true });
      const result = await autoConnectInstalledAgents({
        home,
        path: '',
        applicationDirectories: [],
        installerPath: '/unused/installer.mjs',
        executablePath: '/unused/electron',
        userDataPath: join(home, 'user-data'),
        runInstaller: async () => { throw new Error('malformed hooks.json'); }
      });

      expect(result.connected).toEqual([]);
      expect(result.newlyConnected).toEqual([]);
      expect(result.failures).toEqual([{ provider: 'cursor', message: 'malformed hooks.json' }]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
