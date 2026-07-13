declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
import type { ExtensionToWebviewMessage } from '../src/contracts/messages';
import type { MonitorStateSnapshot, TrafficLightState } from '../src/contracts/state';
import { quickReplyActions } from '../src/contracts/terminal';
const vscode = acquireVsCodeApi();
let snapshot: MonitorStateSnapshot | undefined;
let pending = false;
const app = document.getElementById('app')!;
window.addEventListener('message', event => receive(event.data as ExtensionToWebviewMessage));
vscode.postMessage({ type: 'WEBVIEW_READY' });

function receive(message: ExtensionToWebviewMessage): void {
  if (message.type === 'STATE_SNAPSHOT') { if (snapshot && message.payload.revision < snapshot.revision) return; snapshot = message.payload; pending = false; render(); return; }
  if (message.type === 'AUDIO_CUE') { if (!snapshot || message.payload.stateRevision < snapshot.revision) return; beep(message.payload.cue); return; }
  if (message.type === 'COMMAND_RESULT') { pending = false; render(); announce(message.payload.message); }
}
function render(): void {
  if (!snapshot) return;
  const state = snapshot.trafficLight;
  const meta = labels[state];
  const question = snapshot.blockedPrompt?.questionText;
  app.replaceChildren();
  const section = element('section', 'panel');
  section.append(element('p', 'eyebrow', 'TERMINAL AGENT'), element('h1', 'title', '运行状态'));
  const light = element('div', `signal ${stateClass(state)}`); light.setAttribute('role', 'img'); light.setAttribute('aria-label', `${meta.title}：${snapshot.detailText}`);
  light.append(element('span', 'signal-dot'), element('span', 'signal-glow'));
  section.append(light, element('h2', 'state-title', meta.title), element('p', 'detail', snapshot.detailText));
  const terminal = element('div', 'terminal-name', snapshot.activeTerminal ? snapshot.activeTerminal.name : '未选择终端'); terminal.title = snapshot.activeTerminal ? `目标终端：${snapshot.activeTerminal.name}` : '请打开并选择一个集成终端'; section.append(terminal);
  if (question) { const questionBox = element('div', 'question'); questionBox.title = question; questionBox.append(element('span', 'question-label', '检测到的问题'), element('p', 'question-text', question)); section.append(questionBox); }
  if (state === 'AWAITING_INPUT' && snapshot.blockedPrompt?.allowedActionIds.length) { const actions = element('div', 'actions'); for (const id of snapshot.blockedPrompt.allowedActionIds) { const action = quickReplyActions[id]; const label = snapshot.blockedPrompt.actionLabels?.[id] ?? action.label; const button = element('button', id === 'confirmYes' || id === 'confirmOverwrite' || id === 'selectOption1' ? 'primary' : 'secondary', label) as HTMLButtonElement; button.disabled = pending; button.addEventListener('click', () => { if (!snapshot?.activeTerminal || !snapshot.blockedPrompt || pending) return; pending = true; render(); vscode.postMessage({ type: 'REQUEST_QUICK_REPLY', payload: { requestId: crypto.randomUUID?.() ?? String(Date.now()), terminalId: snapshot.activeTerminal.terminalId, blockId: snapshot.blockedPrompt.blockId, actionId: id } }); }); actions.append(button); } section.append(actions); }
  if (state === 'NO_TARGET' || state === 'MONITOR_UNAVAILABLE' || state === 'TERMINAL_CLOSED') { const refresh = element('button', 'secondary full', '刷新终端状态') as HTMLButtonElement; refresh.addEventListener('click', () => vscode.postMessage({ type: 'REQUEST_REFRESH' })); section.append(refresh); }
  section.append(element('p', 'hint', meta.hint)); app.append(section);
}
const labels: Record<TrafficLightState, { title: string; hint: string }> = { NORMAL: { title: '监控正常', hint: '命令正在运行；尚未发现需要你操作的提示。' }, AWAITING_INPUT: { title: '需要你的确认', hint: '可用快捷按钮只会发送预定义的安全回复。' }, COMMAND_FAILED: { title: '命令异常结束', hint: '请查看终端中的完整输出。' }, COMMAND_ENDED: { title: '命令已结束', hint: '该命令已完成。下一条命令会自动重新开始监控。' }, TERMINAL_CLOSED: { title: '终端已关闭', hint: '打开一个终端并执行“选择活动终端”。' }, MONITOR_UNAVAILABLE: { title: '无法监控', hint: '启用 Shell Integration 后，重新选择此终端。' }, NO_TARGET: { title: '未选择终端', hint: '打开集成终端后，从命令面板选择活动终端。' } };
function stateClass(state: TrafficLightState): string { return state === 'NORMAL' ? 'green' : state === 'AWAITING_INPUT' ? 'yellow' : ['NO_TARGET', 'MONITOR_UNAVAILABLE'].includes(state) ? 'gray' : 'red'; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; if (content) node.textContent = content; return node; }
function announce(message: string): void { let live = document.getElementById('live'); if (!live) { live = document.createElement('div'); live.id = 'live'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); document.body.append(live); } live.textContent = message; }
function beep(cue: 'NORMAL' | 'BLOCKED' | 'ERROR'): void { try { const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Ctx) return; const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = cue === 'BLOCKED' ? 660 : cue === 'ERROR' ? 240 : 520; gain.gain.setValueAtTime(.06, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .14); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .14); } catch { /* audio can be blocked by host settings */ } }
