import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export const AGENT_PROVIDERS = ['claude', 'codex', 'cursor', 'opencode', 'hermes'] as const;
export type AgentProvider = typeof AGENT_PROVIDERS[number];

export interface DetectedAgent {
  provider: AgentProvider;
  label: string;
  evidence: string[];
}

export interface AutoConnectResult {
  detected: DetectedAgent[];
  connected: AgentProvider[];
  newlyConnected: AgentProvider[];
  failures: Array<{ provider: AgentProvider; message: string }>;
}

export interface DetectionOptions {
  home?: string;
  path?: string;
  applicationDirectories?: string[];
}

export interface AutoConnectOptions extends DetectionOptions {
  installerPath: string;
  executablePath: string;
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  runInstaller?: (provider: AgentProvider) => Promise<void>;
}

interface AutoConnectState {
  connectedProviders: AgentProvider[];
  executablePath: string;
  lastScanAt: string;
}

const definitions: Array<{
  provider: AgentProvider;
  label: string;
  configPaths: string[];
  binaryNames: string[];
  appNames: string[];
}> = [
  { provider: 'claude', label: 'Claude Code', configPaths: ['.claude'], binaryNames: ['claude'], appNames: [] },
  { provider: 'codex', label: 'Codex', configPaths: ['.codex'], binaryNames: ['codex'], appNames: ['Codex.app'] },
  { provider: 'cursor', label: 'Cursor', configPaths: ['.cursor', 'Library/Application Support/Cursor'], binaryNames: ['cursor'], appNames: ['Cursor.app'] },
  { provider: 'opencode', label: 'OpenCode', configPaths: ['.config/opencode'], binaryNames: ['opencode'], appNames: ['OpenCode.app', 'opencode.app'] },
  { provider: 'hermes', label: 'Hermes', configPaths: ['.hermes'], binaryNames: ['hermes'], appNames: [] }
];

export function detectInstalledAgents(options: DetectionOptions = {}): DetectedAgent[] {
  const home = options.home ?? homedir();
  const applicationDirectories = options.applicationDirectories ?? ['/Applications', join(home, 'Applications')];
  const binaryDirectories = discoverBinaryDirectories(home, options.path ?? process.env.PATH ?? '', options.path === undefined);

  return definitions.flatMap(definition => {
    const evidence = new Set<string>();
    for (const relativePath of definition.configPaths) {
      const path = join(home, relativePath);
      if (existsSync(path)) evidence.add(path);
    }
    for (const directory of binaryDirectories) {
      for (const binaryName of definition.binaryNames) {
        const path = join(directory, binaryName);
        if (existsSync(path)) evidence.add(path);
      }
    }
    for (const directory of applicationDirectories) {
      for (const appName of definition.appNames) {
        const path = join(directory, appName);
        if (existsSync(path)) evidence.add(path);
      }
    }
    return evidence.size ? [{ provider: definition.provider, label: definition.label, evidence: [...evidence] }] : [];
  });
}

export async function autoConnectInstalledAgents(options: AutoConnectOptions): Promise<AutoConnectResult> {
  const detected = detectInstalledAgents(options);
  const statePath = join(options.userDataPath, 'auto-connect.json');
  const previous = readState(statePath);
  const connected: AgentProvider[] = [];
  const failures: AutoConnectResult['failures'] = [];
  const runInstaller = options.runInstaller ?? (provider => executeInstaller(options, provider));

  for (const agent of detected) {
    try {
      await runInstaller(agent.provider);
      connected.push(agent.provider);
    } catch (error) {
      failures.push({ provider: agent.provider, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const previouslyConnected = new Set(previous.connectedProviders);
  const executableMoved = Boolean(previous.executablePath) && previous.executablePath !== options.executablePath;
  const newlyConnected = connected.filter(provider => executableMoved || !previouslyConnected.has(provider));
  const nextConnected = new Set(previous.connectedProviders);
  for (const provider of connected) nextConnected.add(provider);
  writeState(statePath, {
    connectedProviders: AGENT_PROVIDERS.filter(provider => nextConnected.has(provider)),
    executablePath: options.executablePath,
    lastScanAt: new Date().toISOString()
  });
  return { detected, connected, newlyConnected, failures };
}

export function providerLabel(provider: AgentProvider): string {
  return definitions.find(definition => definition.provider === provider)?.label ?? provider;
}

function discoverBinaryDirectories(home: string, path: string, includeSystemDefaults: boolean): string[] {
  const directories = new Set(path.split(':').filter(Boolean));
  for (const directory of ['.local/bin', '.bun/bin', '.cargo/bin', '.local/share/pnpm']) directories.add(join(home, directory));
  if (includeSystemDefaults) {
    for (const directory of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']) directories.add(directory);
  }
  for (const root of [join(home, '.nvm', 'versions', 'node'), join(home, '.asdf', 'installs', 'nodejs')]) {
    try {
      for (const version of readdirSync(root)) directories.add(join(root, version, 'bin'));
    } catch { /* optional version manager is not installed */ }
  }
  return [...directories];
}

function executeInstaller(options: AutoConnectOptions, provider: AgentProvider): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(options.executablePath, [options.installerPath, provider], {
      env: { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: '1', HOME: options.home ?? homedir() },
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    }, (error, _stdout, stderr) => {
      if (!error) return resolve();
      const detail = stderr.trim();
      reject(new Error(detail || error.message));
    });
  });
}

function readState(path: string): AutoConnectState {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<AutoConnectState>;
    const connectedProviders = Array.isArray(value.connectedProviders)
      ? value.connectedProviders.filter((provider): provider is AgentProvider => AGENT_PROVIDERS.includes(provider as AgentProvider))
      : [];
    return {
      connectedProviders,
      executablePath: typeof value.executablePath === 'string' ? value.executablePath : '',
      lastScanAt: typeof value.lastScanAt === 'string' ? value.lastScanAt : ''
    };
  } catch {
    return { connectedProviders: [], executablePath: '', lastScanAt: '' };
  }
}

function writeState(path: string, state: AutoConnectState): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
