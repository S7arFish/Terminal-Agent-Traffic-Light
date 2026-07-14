import type { AgentProvider, DetectedAgent } from './agentAutoConnector';

const api = window.trafficLightDesktop;
const button = document.getElementById('connect-agents') as HTMLButtonElement;
const buttonLabel = button.querySelector('.button-label')!;
const list = document.getElementById('agent-list')!;
const count = document.getElementById('connected-count')!;
const summary = document.getElementById('summary-label')!;
const note = document.getElementById('connection-note')!;
const providers: Array<{ id: AgentProvider; label: string; monogram: string; detail: string }> = [
  { id: 'claude', label: 'Claude Code', monogram: 'C', detail: 'Hooks' },
  { id: 'codex', label: 'Codex', monogram: 'CX', detail: 'Hooks · 需信任' },
  { id: 'cursor', label: 'Cursor', monogram: 'CU', detail: 'Hooks' },
  { id: 'opencode', label: 'OpenCode', monogram: 'O', detail: 'Plugin' },
  { id: 'hermes', label: 'Hermes', monogram: 'H', detail: 'Shell Hooks' }
];

button.addEventListener('click', () => void connectAgents());
void scanAgents();

async function scanAgents(): Promise<void> {
  setBusy(true, '正在扫描');
  try {
    const detected = await api.scanAgents();
    render(detected, [], []);
    note.textContent = detected.length ? `发现 ${detected.length} 个 Agent。点击连接后，请重启对应 Agent。` : '暂未发现支持的 Agent。可以先启动一次 Agent，再重新扫描。';
  } catch (error) {
    render([], [], []);
    note.textContent = errorMessage(error, '扫描失败，请稍后重试。');
  } finally {
    setBusy(false, '扫描并连接');
  }
}

async function connectAgents(): Promise<void> {
  setBusy(true, '正在连接');
  note.textContent = '正在安全地合并 Hook 与 Plugin 配置…';
  try {
    const result = await api.connectAgents();
    render(result.detected, result.connected, result.failures.map(failure => failure.provider));
    if (result.failures.length) {
      note.textContent = `有 ${result.failures.length} 个 Agent 连接失败：${result.failures.map(failure => providerName(failure.provider)).join('、')}。原配置仍保留。`;
    } else if (result.connected.length) {
      note.textContent = `已连接 ${result.connected.length} 个 Agent。请重启它们；Codex 还需在 /hooks 中信任。`;
    } else {
      note.textContent = '没有检测到可连接的 Agent。';
    }
  } catch (error) {
    note.textContent = errorMessage(error, '连接失败，请稍后重试。');
  } finally {
    setBusy(false, '重新扫描并连接');
  }
}

function render(detected: DetectedAgent[], connected: AgentProvider[], failures: AgentProvider[]): void {
  const found = new Set(detected.map(agent => agent.provider));
  const active = new Set(connected);
  const failed = new Set(failures);
  list.replaceChildren();
  for (const provider of providers) {
    const state = failed.has(provider.id) ? 'failed' : active.has(provider.id) ? 'connected' : found.has(provider.id) ? 'detected' : 'missing';
    const card = document.createElement('article');
    card.className = `agent-card ${state}`;
    const identity = document.createElement('div'); identity.className = 'agent-identity';
    const mark = document.createElement('span'); mark.className = 'agent-mark'; mark.textContent = provider.monogram;
    const copy = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = provider.label;
    const detail = document.createElement('p'); detail.textContent = provider.detail;
    copy.append(title, detail); identity.append(mark, copy);
    const status = document.createElement('span'); status.className = 'agent-status'; status.textContent = stateLabel(state);
    card.append(identity, status); list.append(card);
  }
  const connectedOrFound = active.size || found.size;
  count.textContent = String(connectedOrFound);
  summary.textContent = active.size ? '已连接' : found.size ? '已发现' : '等待发现';
}

function setBusy(value: boolean, label: string): void { button.disabled = value; button.classList.toggle('busy', value); buttonLabel.textContent = label; }
function providerName(provider: AgentProvider): string { return providers.find(item => item.id === provider)?.label ?? provider; }
function stateLabel(state: string): string { return state === 'connected' ? '已连接' : state === 'detected' ? '已发现' : state === 'failed' ? '失败' : '未发现'; }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }

export {};
