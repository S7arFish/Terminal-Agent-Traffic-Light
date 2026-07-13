import * as vscode from 'vscode';
import { readSettings } from '../config/settings';
import type { TerminalId } from '../contracts/terminal';
import { PromptDetector } from '../detector/promptDetector';
import { StateStore } from '../state/stateStore';
import { TerminalRegistry } from './terminalRegistry';
import { TerminalSession } from './terminalSession';

export class TerminalMonitor implements vscode.Disposable {
  readonly registry = new TerminalRegistry();
  private readonly sessions = new Map<TerminalId, TerminalSession>();
  private readonly reads = new Map<TerminalId, { cancelled: boolean }>();
  private readonly disposables: vscode.Disposable[] = [];
  private activeId?: TerminalId;
  constructor(private readonly store: StateStore) {}
  start(): void {
    vscode.window.terminals.forEach(t => this.registry.register(t));
    this.disposables.push(
      vscode.window.onDidOpenTerminal(t => this.registry.register(t)),
      vscode.window.onDidCloseTerminal(t => { const id = this.registry.remove(t); this.sessions.get(id ?? '')?.dispose(); this.reads.get(id ?? '') && (this.reads.get(id ?? '')!.cancelled = true); if (id === this.activeId) this.store.setClosed(); }),
      vscode.window.onDidChangeActiveTerminal(t => { if (readSettings().autoSelectActiveTerminal && t) this.setActiveTerminal(this.registry.idOf(t)); }),
      vscode.window.onDidChangeTerminalShellIntegration(({ terminal }) => { if (this.registry.idOf(terminal) === this.activeId) this.setActiveTerminal(this.activeId!); }),
      vscode.window.onDidStartTerminalShellExecution(e => this.onStarted(e)),
      vscode.window.onDidEndTerminalShellExecution(e => this.onEnded(e))
    );
    const active = vscode.window.activeTerminal;
    if (active) this.setActiveTerminal(this.registry.idOf(active)); else this.store.setTarget(undefined);
  }
  setActiveTerminal(id: TerminalId): { success: boolean; message: string } { const terminal = this.registry.get(id); if (!terminal) return { success: false, message: '目标终端不存在或已关闭' }; this.activeId = id; this.store.setTarget(this.registry.descriptor(terminal, true)); return { success: true, message: '已选择终端' }; }
  stop(): void { for (const token of this.reads.values()) token.cancelled = true; this.reads.clear(); for (const session of this.sessions.values()) session.dispose(); this.sessions.clear(); }
  getActiveId(): TerminalId | undefined { return this.activeId; }
  private onStarted(event: vscode.TerminalShellExecutionStartEvent): void { const id = this.registry.idOf(event.terminal); const terminal = event.terminal; if (id !== this.activeId) return; if (!terminal.shellIntegration) { this.store.setUnavailable('无法读取该终端：Shell Integration 不可用。'); return; }
    const settings = readSettings(); const session = this.sessions.get(id) ?? new TerminalSession(id, settings.maxBufferedCharacters, new PromptDetector(settings.customPromptPatterns), (p, c) => this.store.setBlocked(p, c)); this.sessions.set(id, session);
    const command = { commandId: `${id}:${Date.now()}`, terminalId: id, startedAtEpochMs: Date.now() }; session.startCommand(command); this.store.setNormal(command);
    const token = { cancelled: false }; this.reads.get(id) && (this.reads.get(id)!.cancelled = true); this.reads.set(id, token); void session.consume(event.execution, token);
  }
  private onEnded(event: vscode.TerminalShellExecutionEndEvent): void { const id = this.registry.idOf(event.terminal); if (id !== this.activeId) return; const command = this.sessions.get(id)?.endCommand(event.exitCode); if (!command) return; if (event.exitCode === 0) { if (readSettings().showCompletionAsRed) this.store.setEnded(command); else this.store.setNormal(command); } else this.store.setFailed(event.exitCode === undefined ? '命令结束，但无法获得退出状态' : `命令以退出码 ${event.exitCode} 结束`, command); }
  dispose(): void { this.stop(); vscode.Disposable.from(...this.disposables).dispose(); }
}
