import type { AgentAction, AgentHubSnapshot, AgentPhase, AgentProvider, AgentSession } from '../src/contracts/agent';
import type { MonitorStateSnapshot, TrafficLightState } from '../src/contracts/state';
import { quickReplyActions, type QuickReplyActionId } from '../src/contracts/terminal';
import { ExpansionCoordinator } from './expansionCoordinator';
import { estimatePanelSize, type PanelSize } from './panelSizing';

type ConnectionInfo = { endpoint: string; token: string; protocol?: 'agent-light/1' | 'terminal/1'; capturePath?: string };
type ViewSession = { key: string; sessionId: string; provider: AgentProvider; providerLabel: string; phase: AgentPhase; title: string; detail: string; message?: string; workspace?: string; requestId?: string; actions: AgentAction[]; legacy?: MonitorStateSnapshot };
declare global { interface Window { trafficLightDesktop: { getConnection(): Promise<ConnectionInfo>; setAlwaysOnTop(value: boolean): Promise<boolean>; isAlwaysOnTop(): Promise<boolean>; setExpanded(value: boolean, reduceMotion: boolean, preferredSize?: PanelSize): Promise<boolean>; capture(path: string): Promise<boolean>; close(): void } } }

const api = window.trafficLightDesktop;
const content = document.getElementById('content')!;
const connectionDot = document.getElementById('connection')!;
const pin = document.getElementById('pin') as HTMLButtonElement;
const compact = document.getElementById('compact') as HTMLButtonElement;
const close = document.getElementById('close') as HTMLButtonElement;
const compactExpand = document.getElementById('compact-expand') as HTMLButtonElement;
const compactPin = document.getElementById('compact-pin') as HTMLButtonElement;
const compactClose = document.getElementById('compact-close') as HTMLButtonElement;
const live = document.getElementById('live')!;
let sessions: ViewSession[] = [];
let active: ViewSession | undefined;
let previousPhase: AgentPhase | undefined;
const pendingReplies = new Set<string>();
let reconnectDelay = 1_000;
let bridge: ConnectionInfo | undefined;
let collapseTimer: number | undefined;
let latestRevision = -1;
const expansion = new ExpansionCoordinator(value => api.setExpanded(value, window.matchMedia('(prefers-reduced-motion: reduce)').matches, value ? preferredPanelSize() : undefined), value => document.body.classList.toggle('collapsed', !value));

void api.isAlwaysOnTop().then(value => setPin(value));
pin.addEventListener('click', async () => setPin(await api.setAlwaysOnTop(pin.getAttribute('aria-pressed') !== 'true')));
compactPin.addEventListener('click', async () => setPin(await api.setAlwaysOnTop(compactPin.getAttribute('aria-pressed') !== 'true')));
compact.addEventListener('click', () => void setExpanded(false));
close.addEventListener('click', () => api.close());
compactExpand.addEventListener('click', () => void setExpanded(true));
compactClose.addEventListener('click', () => api.close());
document.getElementById('app')!.addEventListener('mouseenter', () => { if (active?.phase === 'waiting') void setExpanded(true); });
document.getElementById('app')!.addEventListener('mouseleave', scheduleCollapse);
void api.getConnection().then(value => { bridge = value; connect(); });

function connect(): void {
  if (!bridge) return;
  connectionDot.className = 'connection';
  const events = new EventSource(`${bridge.endpoint}/events?token=${encodeURIComponent(bridge.token)}`);
  events.addEventListener('open', () => { reconnectDelay = 1_000; connectionDot.className = 'connection online'; });
  events.addEventListener('state', event => {
    const raw = JSON.parse((event as MessageEvent).data) as AgentHubSnapshot | MonitorStateSnapshot;
    if (raw.revision < latestRevision) return;
    latestRevision = raw.revision;
    previousPhase = active?.phase;
    sessions = isHubSnapshot(raw) ? raw.sessions.map(toViewSession) : [legacyView(raw)];
    active = sessions[0];
    const waitingKeys = new Set(sessions.filter(session => session.phase === 'waiting').map(replyKey));
    for (const key of pendingReplies) if (!waitingKeys.has(key)) pendingReplies.delete(key);
    render();
    if (bridge?.capturePath && sessions.length) { const path = bridge.capturePath; bridge.capturePath = undefined; window.setTimeout(() => void api.capture(path), 600); }
    if (active?.phase !== 'waiting') scheduleCollapse(140);
    if (previousPhase && active && previousPhase !== active.phase) playCue(active.phase);
  });
  events.onerror = () => { events.close(); connectionDot.className = 'connection offline'; renderDisconnected(); window.setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(10_000, reconnectDelay * 2); };
}

function render(): void {
  if (!active) return renderEmpty();
  const meta = phaseLabels[active.phase];
  content.replaceChildren();
  const light = el('button', `light ${meta.color}`) as HTMLButtonElement;
  light.type = 'button';
  light.setAttribute('aria-label', `${meta.title}：${active.detail}，点击展开详情`);
  light.append(el('span', 'orb'), el('span', 'orb-glint'));
  light.addEventListener('click', () => void setExpanded(!expansion.isExpanded));
  content.append(light, el('h1', 'status', meta.title), el('p', 'detail', active.detail));
  const identity = el('div', 'identity');
  identity.append(el('span', 'provider', active.providerLabel));
  if (active.workspace) identity.append(el('span', 'workspace', shortWorkspace(active.workspace)));
  content.append(identity);
  if (active.message) content.append(el('div', 'prompt', active.message));
  if (active.phase === 'waiting' && active.actions.length) {
    const actions = el('div', `actions${active.actions.length > 2 ? ' numbered' : ''}`);
    for (const action of active.actions) {
      const button = el('button', `reply ${action.kind === 'primary' ? 'primary' : ''}${action.kind === 'destructive' ? ' destructive' : ''}`, action.label) as HTMLButtonElement;
      button.disabled = pendingReplies.has(replyKey(active));
      button.addEventListener('click', () => void reply(action.id));
      actions.append(button);
    }
    content.append(actions);
  }
  if (sessions.length > 1) {
    const rail = el('div', 'session-rail');
    for (const session of sessions) {
      const item = el('button', `session-chip ${phaseLabels[session.phase].color}${session.key === active.key ? ' selected' : ''}`) as HTMLButtonElement;
      item.type = 'button'; item.title = `${session.providerLabel} · ${phaseLabels[session.phase].title}`;
      item.append(el('span', 'session-dot'), el('span', 'session-name', session.providerLabel));
      item.addEventListener('click', () => { active = session; render(); });
      rail.append(item);
    }
    content.append(rail);
  }
}

async function reply(actionId: string): Promise<void> {
  if (!bridge || !active) return;
  const session = active;
  const key = replyKey(session);
  if (pendingReplies.has(key)) return;
  pendingReplies.add(key); render();
  let result: ReplyResult;
  if (session.legacy?.activeTerminal && session.legacy.blockedPrompt) {
    result = await postReply(`${bridge.endpoint}/reply`, { requestId: crypto.randomUUID(), terminalId: session.legacy.activeTerminal.terminalId, blockId: session.legacy.blockedPrompt.blockId, actionId }, '无法连接 VS Code');
  } else {
    result = await postReply(`${bridge.endpoint}/v1/reply`, { provider: session.provider, sessionId: session.sessionId, requestId: session.requestId, actionId }, '无法连接 Agent Light');
  }
  if (!result.success) pendingReplies.delete(key);
  render(); showToast(result.message); announce(result.message);
}

function legacyView(snapshot: MonitorStateSnapshot): ViewSession {
  const phase = legacyPhase(snapshot.trafficLight);
  const actions = snapshot.blockedPrompt?.allowedActionIds.map(id => ({ id, label: snapshot.blockedPrompt?.actionLabels?.[id] ?? quickReplyActions[id].label, kind: primaryLegacyAction(id) ? 'primary' as const : 'secondary' as const })) ?? [];
  const sessionId = snapshot.activeTerminal?.terminalId ?? 'none';
  return { key: `terminal:${sessionId}`, sessionId, provider: 'terminal', providerLabel: snapshot.activeTerminal?.name ?? 'VS Code 终端', phase, title: snapshot.activeTerminal?.name ?? 'Terminal', detail: snapshot.detailText, message: snapshot.blockedPrompt?.questionText, actions, legacy: snapshot };
}
function toViewSession(session: AgentSession): ViewSession { return { key: `${session.provider}:${session.sessionId}`, sessionId: session.sessionId, provider: session.provider, providerLabel: providerLabels[session.provider], phase: session.phase, title: session.title ?? providerLabels[session.provider], detail: session.title ?? phaseLabels[session.phase].detail, message: session.message, workspace: session.workspace, requestId: session.requestId, actions: session.actions ?? [] }; }
function renderEmpty(): void { content.replaceChildren(el('div', 'empty-orb'), el('h1', 'status', '等待 Agent'), el('p', 'detail', '启动已连接的 Agent 后，状态会出现在这里')); }
function renderDisconnected(): void { if (!active) content.replaceChildren(el('p', 'loading', '正在重新连接本机状态中心…')); }
function setPin(value: boolean): void { for (const button of [pin, compactPin]) { button.setAttribute('aria-pressed', String(value)); button.classList.toggle('active', value); button.title = value ? '已始终置顶' : '未置顶'; } }
async function setExpanded(value: boolean): Promise<void> { if (collapseTimer) window.clearTimeout(collapseTimer); await expansion.request(value); }
function scheduleCollapse(delay = 420): void { if (collapseTimer) window.clearTimeout(collapseTimer); collapseTimer = window.setTimeout(() => void setExpanded(false), delay); }
function preferredPanelSize(): PanelSize { return estimatePanelSize(active?.message, active?.actions.map(action => action.label)); }
function isHubSnapshot(value: AgentHubSnapshot | MonitorStateSnapshot): value is AgentHubSnapshot { return 'protocol' in value && value.protocol === 'agent-light/1'; }
function legacyPhase(state: TrafficLightState): AgentPhase { if (state === 'NORMAL') return 'running'; if (state === 'AWAITING_INPUT') return 'waiting'; if (state === 'COMMAND_FAILED') return 'failed'; if (['COMMAND_ENDED', 'TERMINAL_CLOSED'].includes(state)) return 'completed'; return 'offline'; }
function primaryLegacyAction(id: QuickReplyActionId): boolean { return ['confirmYes', 'confirmOverwrite', 'selectOption1'].includes(id); }
function authHeaders(): Record<string, string> { return { Authorization: `Bearer ${bridge?.token ?? ''}`, 'Content-Type': 'application/json' }; }
type ReplyResult = { success: boolean; message: string };
async function postReply(url: string, body: unknown, fallback: string): Promise<ReplyResult> {
  try {
    const response = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    const value = await response.json().catch(() => ({})) as Partial<ReplyResult>;
    return { success: response.ok && value.success === true, message: typeof value.message === 'string' ? value.message : response.ok ? '选择已发送' : fallback };
  } catch { return { success: false, message: fallback }; }
}
function replyKey(session: ViewSession): string { return JSON.stringify([session.key, session.requestId ?? session.legacy?.blockedPrompt?.blockId ?? null]); }
function shortWorkspace(path: string): string { return path.split(/[\\/]/).filter(Boolean).pop() ?? path; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; }
function showToast(message: string): void { document.querySelector('.toast')?.remove(); const toast = el('div', 'toast', message); document.getElementById('app')!.append(toast); window.setTimeout(() => toast.remove(), 3_000); }
function announce(message: string): void { live.textContent = message; }
function playCue(phase: AgentPhase): void { if (!['waiting', 'completed', 'failed'].includes(phase)) return; try { const ctx = new AudioContext(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.frequency.value = phase === 'waiting' ? 660 : 260; gain.gain.setValueAtTime(.06, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .16); oscillator.connect(gain).connect(ctx.destination); oscillator.onended = () => void ctx.close(); oscillator.start(); oscillator.stop(ctx.currentTime + .16); } catch { /* optional */ } }

const providerLabels: Record<AgentProvider, string> = { terminal: 'Terminal', 'claude-code': 'Claude Code', opencode: 'OpenCode', cursor: 'Cursor', codex: 'Codex', hermes: 'Hermes', generic: 'Agent' };
const phaseLabels: Record<AgentPhase, { title: string; detail: string; color: 'green' | 'yellow' | 'red' | 'gray' }> = {
  running: { title: 'Agent 正在工作', detail: '任务正在进行，不需要操作', color: 'green' },
  waiting: { title: '需要你的确认', detail: 'Agent 正在等待你的选择', color: 'yellow' },
  completed: { title: '任务已完成', detail: 'Agent 已完成这一轮工作', color: 'red' },
  failed: { title: '任务遇到问题', detail: 'Agent 执行失败或异常停止', color: 'red' },
  idle: { title: '等待新任务', detail: 'Agent 当前处于空闲状态', color: 'gray' },
  offline: { title: 'Agent 未连接', detail: '尚未收到 Agent 状态事件', color: 'gray' }
};
