import * as vscode from 'vscode';
import type { TerminalDescriptor, TerminalId } from '../contracts/terminal';
export class TerminalRegistry {
  private readonly ids = new WeakMap<vscode.Terminal, TerminalId>();
  private readonly terminals = new Map<TerminalId, vscode.Terminal>();
  private serial = 0;
  register(terminal: vscode.Terminal): TerminalId { let id = this.ids.get(terminal); if (!id) { id = `terminal-${++this.serial}`; this.ids.set(terminal, id); this.terminals.set(id, terminal); } return id; }
  remove(terminal: vscode.Terminal): TerminalId | undefined { const id = this.ids.get(terminal); if (id) this.terminals.delete(id); return id; }
  get(id: TerminalId): vscode.Terminal | undefined { return this.terminals.get(id); }
  idOf(terminal: vscode.Terminal): TerminalId { return this.register(terminal); }
  descriptor(terminal: vscode.Terminal, active: boolean): TerminalDescriptor { return { terminalId: this.register(terminal), name: terminal.name, isActive: active, supportsShellIntegration: !!terminal.shellIntegration }; }
  list(active?: vscode.Terminal): TerminalDescriptor[] { return [...this.terminals.values()].map(t => this.descriptor(t, t === active)); }
}
