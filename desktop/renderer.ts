import type { MonitorStateSnapshot, TrafficLightState } from '../src/contracts/state';
import { quickReplyActions, type QuickReplyActionId } from '../src/contracts/terminal';
import { ExpansionCoordinator } from './expansionCoordinator';
import { estimatePanelSize, type PanelSize } from './panelSizing';

declare global { interface Window { trafficLightDesktop: { getConnection(): Promise<{ endpoint: string; token: string }>; setAlwaysOnTop(value: boolean): Promise<boolean>; isAlwaysOnTop(): Promise<boolean>; setExpanded(value: boolean, reduceMotion: boolean, preferredSize?: PanelSize): Promise<boolean>; close(): void } } }

const api = window.trafficLightDesktop;
const content = document.getElementById('content')!;
const connection = document.getElementById('connection')!;
const pin = document.getElementById('pin') as HTMLButtonElement;
const compact = document.getElementById('compact') as HTMLButtonElement;
const close = document.getElementById('close') as HTMLButtonElement;
const compactExpand = document.getElementById('compact-expand') as HTMLButtonElement;
const compactPin = document.getElementById('compact-pin') as HTMLButtonElement;
const compactClose = document.getElementById('compact-close') as HTMLButtonElement;
const live = document.getElementById('live')!;
let snapshot: MonitorStateSnapshot | undefined;
let previousState: TrafficLightState | undefined;
let pending = false;
let reconnectDelay = 1_000;
let bridge: { endpoint: string; token: string } | undefined;
let collapseTimer: number | undefined;
const expansion = new ExpansionCoordinator(value => api.setExpanded(value, window.matchMedia('(prefers-reduced-motion: reduce)').matches, value ? preferredPanelSize() : undefined), value => document.body.classList.toggle('collapsed', !value));

void api.isAlwaysOnTop().then(value => setPin(value));
pin.addEventListener('click', async () => setPin(await api.setAlwaysOnTop(pin.getAttribute('aria-pressed') !== 'true')));
compactPin.addEventListener('click', async () => setPin(await api.setAlwaysOnTop(compactPin.getAttribute('aria-pressed') !== 'true')));
compact.addEventListener('click', () => void setExpanded(false));
close.addEventListener('click', () => api.close());
compactExpand.addEventListener('click', () => void setExpanded(true));
compactClose.addEventListener('click', () => api.close());
document.getElementById('app')!.addEventListener('mouseenter', () => { if (snapshot?.trafficLight === 'AWAITING_INPUT') void setExpanded(true); });
document.getElementById('app')!.addEventListener('mouseleave', () => scheduleCollapse());
void api.getConnection().then(value => { bridge = value; connect(); });

function connect(): void {
  if (!bridge) return;
  connection.className = 'connection';
  const events = new EventSource(`${bridge.endpoint}/events?token=${encodeURIComponent(bridge.token)}`);
  events.addEventListener('open', () => { reconnectDelay = 1_000; connection.className = 'connection online'; });
  events.addEventListener('state', event => {
    const next = JSON.parse((event as MessageEvent).data) as MonitorStateSnapshot;
    if (snapshot && next.revision < snapshot.revision) return;
    previousState = snapshot?.trafficLight; snapshot = next; pending = false; render();
    if (next.trafficLight !== 'AWAITING_INPUT') scheduleCollapse(120);
    if (previousState && previousState !== next.trafficLight) playCue(next.trafficLight);
  });
  events.onerror = () => { events.close(); connection.className = 'connection offline'; renderDisconnected(); window.setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(10_000, reconnectDelay * 2); };
}

function render(): void {
  if (!snapshot) return;
  const meta = labels[snapshot.trafficLight];
  content.replaceChildren();
  const light = el('button', `light ${stateClass(snapshot.trafficLight)}`) as HTMLButtonElement; light.type = 'button'; light.setAttribute('aria-label', `${meta.title}：${snapshot.detailText}${snapshot.trafficLight === 'AWAITING_INPUT' ? '，点击展开操作' : ''}`); light.append(el('span', 'orb'));
  light.addEventListener('click', () => { if (snapshot?.trafficLight === 'AWAITING_INPUT') void setExpanded(!expansion.isExpanded); });
  content.append(light, el('h1', 'status', meta.title), el('p', 'detail', snapshot.detailText), el('div', 'terminal', snapshot.activeTerminal?.name ?? '未连接终端'));
  if (snapshot.blockedPrompt?.questionText) content.append(el('div', 'prompt', snapshot.blockedPrompt.questionText));
  if (snapshot.trafficLight === 'AWAITING_INPUT' && snapshot.blockedPrompt?.allowedActionIds.length) {
    const isNumbered = snapshot.blockedPrompt.allowedActionIds.some(id => id.startsWith('selectOption'));
    const actions = el('div', `actions${isNumbered ? ' numbered' : ''}`);
    for (const actionId of snapshot.blockedPrompt.allowedActionIds) {
      const action = quickReplyActions[actionId]; const label = snapshot.blockedPrompt.actionLabels?.[actionId] ?? action.label;
      const button = el('button', `reply ${actionId === 'confirmYes' || actionId === 'confirmOverwrite' || actionId === 'selectOption1' ? 'primary' : ''}`, label) as HTMLButtonElement;
      button.disabled = pending; button.addEventListener('click', () => void reply(actionId)); actions.append(button);
    }
    content.append(actions);
  }
}

async function reply(actionId: QuickReplyActionId): Promise<void> {
  if (!bridge || !snapshot?.activeTerminal || !snapshot.blockedPrompt || pending) return;
  pending = true; render();
  const response = await fetch(`${bridge.endpoint}/reply`, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), terminalId: snapshot.activeTerminal.terminalId, blockId: snapshot.blockedPrompt.blockId, actionId }) }).catch(() => undefined);
  const result = response ? await response.json() as { success: boolean; message: string } : { success: false, message: '无法连接 VS Code' };
  pending = result.success; render(); showToast(result.message); announce(result.message);
}
function renderDisconnected(): void { if (!snapshot) content.replaceChildren(el('p', 'loading', '与 VS Code 的连接已断开，正在重连…')); }
function setPin(value: boolean): void { for (const button of [pin, compactPin]) { button.setAttribute('aria-pressed', String(value)); button.classList.toggle('active', value); button.title = value ? '已始终置顶' : '未置顶'; } }
async function setExpanded(value: boolean): Promise<void> { if (collapseTimer) window.clearTimeout(collapseTimer); await expansion.request(value); }
function scheduleCollapse(delay = 400): void { if (collapseTimer) window.clearTimeout(collapseTimer); collapseTimer = window.setTimeout(() => void setExpanded(false), delay); }
function preferredPanelSize(): PanelSize { const prompt = snapshot?.blockedPrompt; return estimatePanelSize(prompt?.questionText, prompt?.allowedActionIds.map(id => prompt.actionLabels?.[id] ?? quickReplyActions[id].label)); }
function stateClass(state: TrafficLightState): string { return state === 'NORMAL' ? 'green' : state === 'AWAITING_INPUT' ? 'yellow' : ['NO_TARGET', 'MONITOR_UNAVAILABLE'].includes(state) ? 'gray' : 'red'; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; }
function showToast(message: string): void { document.querySelector('.toast')?.remove(); const toast = el('div', 'toast', message); document.getElementById('app')!.append(toast); window.setTimeout(() => toast.remove(), 3_000); }
function announce(message: string): void { live.textContent = message; }
function playCue(state: TrafficLightState): void { if (!['AWAITING_INPUT', 'COMMAND_ENDED', 'COMMAND_FAILED'].includes(state)) return; try { const ctx = new AudioContext(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.frequency.value = state === 'AWAITING_INPUT' ? 660 : 260; gain.gain.setValueAtTime(.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18); oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .18); } catch { /* sound is optional */ } }
const labels: Record<TrafficLightState, { title: string }> = { NORMAL: { title: '监控正常' }, AWAITING_INPUT: { title: '需要你的确认' }, COMMAND_FAILED: { title: '命令异常结束' }, COMMAND_ENDED: { title: '命令已结束' }, TERMINAL_CLOSED: { title: '终端已关闭' }, MONITOR_UNAVAILABLE: { title: '无法监控' }, NO_TARGET: { title: '未选择终端' } };
