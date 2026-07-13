import * as vscode from 'vscode';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../contracts/messages';
import type { QuickReplyActionId } from '../contracts/terminal';
import { readSettings } from '../config/settings';
import { TerminalMonitor } from '../monitor/terminalMonitor';
import { QuickReplyService } from '../services/quickReplyService';
import { StateStore } from '../state/stateStore';
import { TrafficLightViewProvider } from './trafficLightViewProvider';

export class UIManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastState;
  constructor(private readonly store: StateStore, private readonly monitor: TerminalMonitor, private readonly quickReply: QuickReplyService, private readonly provider: TrafficLightViewProvider) {
    this.lastState = store.getSnapshot();
    this.disposables.push(this.store.subscribe(snapshot => { const previous = this.lastState; this.lastState = snapshot; this.publish({ type: 'STATE_SNAPSHOT', payload: snapshot }); const cue = audioCue(previous.trafficLight, snapshot.trafficLight); if (cue && readSettings().playSound) this.publish({ type: 'AUDIO_CUE', payload: { cue, stateRevision: snapshot.revision } }); }));
    this.disposables.push(this.provider.onDidResolve(webview => { webview.onDidReceiveMessage(message => void this.handle(message)); }));
  }
  async show(): Promise<void> { await vscode.commands.executeCommand('workbench.view.extension.terminalAgentTrafficLight'); }
  private publish(message: ExtensionToWebviewMessage): void { void this.provider.postMessage(message); }
  private async handle(message: unknown): Promise<void> { if (!isWebviewMessage(message)) return; if (message.type === 'WEBVIEW_READY' || message.type === 'REQUEST_REFRESH') { this.publish({ type: 'STATE_SNAPSHOT', payload: this.store.getSnapshot() }); return; }
    if (message.type === 'SELECT_TERMINAL') { const result = this.monitor.setActiveTerminal(message.payload.terminalId); this.publish({ type: 'COMMAND_RESULT', payload: { requestId: 'terminal-select', ...result } }); return; }
    if (message.type === 'REQUEST_QUICK_REPLY') { const result = await this.quickReply.reply(message.payload); this.publish({ type: 'COMMAND_RESULT', payload: { requestId: message.payload.requestId, ...result } }); }
  }
  dispose(): void { vscode.Disposable.from(...this.disposables).dispose(); }
}
function audioCue(oldState: string, next: string): 'NORMAL' | 'BLOCKED' | 'ERROR' | undefined { if (next === 'AWAITING_INPUT' && oldState !== next) return 'BLOCKED'; if (['COMMAND_FAILED', 'COMMAND_ENDED', 'TERMINAL_CLOSED'].includes(next) && oldState !== next) return 'ERROR'; if (next === 'NORMAL' && oldState !== 'NORMAL') return 'NORMAL'; return undefined; }
function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage { if (!value || typeof value !== 'object' || !('type' in value) || typeof (value as { type: unknown }).type !== 'string') return false; const msg = value as { type: string; payload?: Record<string, unknown> }; if (msg.type === 'WEBVIEW_READY' || msg.type === 'REQUEST_REFRESH') return true; if (msg.type === 'SELECT_TERMINAL') return typeof msg.payload?.terminalId === 'string'; if (msg.type !== 'REQUEST_QUICK_REPLY') return false; return typeof msg.payload?.requestId === 'string' && typeof msg.payload?.terminalId === 'string' && typeof msg.payload?.blockId === 'string' && ['confirmYes', 'confirmNo', 'confirmOverwrite', 'cancel', 'selectOption1', 'selectOption2', 'selectOption3', 'selectOption4', 'selectOption5'].includes(String(msg.payload?.actionId)); }
