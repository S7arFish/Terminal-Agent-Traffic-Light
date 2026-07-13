import * as vscode from 'vscode';
import { registerCommands } from './commands/commandController';
import { TerminalMonitor } from './monitor/terminalMonitor';
import { QuickReplyService } from './services/quickReplyService';
import { StateStore } from './state/stateStore';
import { TrafficLightViewProvider } from './ui/trafficLightViewProvider';
import { UIManager } from './ui/uiManager';
import { DesktopBridge } from './desktop/desktopBridge';
import { readSettings } from './config/settings';

export function activate(context: vscode.ExtensionContext): void {
  const store = new StateStore();
  const monitor = new TerminalMonitor(store);
  const provider = new TrafficLightViewProvider(context.extensionUri);
  const reply = new QuickReplyService(store, monitor.registry);
  const ui = new UIManager(store, monitor, reply, provider);
  const desktop = new DesktopBridge(context.extensionPath, context.globalStorageUri.fsPath, store, reply);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('terminalAgentTrafficLight.view', provider), monitor, ui, desktop);
  registerCommands(context, monitor, reply, store, ui, desktop);
  monitor.start();
  if (readSettings().autoOpenFloatingWindow) void desktop.openWindow().then(result => { if (!result.success) void vscode.window.showErrorMessage(result.message); });
}
export function deactivate(): void { /* subscriptions are disposed by VS Code */ }
