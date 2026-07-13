import * as vscode from 'vscode';
import { TerminalMonitor } from '../monitor/terminalMonitor';
import { QuickReplyService } from '../services/quickReplyService';
import { StateStore } from '../state/stateStore';
import type { QuickReplyActionId } from '../contracts/terminal';
import { DesktopBridge } from '../desktop/desktopBridge';
import { UIManager } from '../ui/uiManager';
export function registerCommands(context: vscode.ExtensionContext, monitor: TerminalMonitor, reply: QuickReplyService, store: StateStore, ui: UIManager, desktop: DesktopBridge): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('terminalAgentTrafficLight.selectActiveTerminal', () => { const t = vscode.window.activeTerminal; if (!t) return vscode.window.showWarningMessage('没有活动终端可供选择'); const r = monitor.setActiveTerminal(monitor.registry.idOf(t)); if (!r.success) void vscode.window.showWarningMessage(r.message); }),
    vscode.commands.registerCommand('terminalAgentTrafficLight.startMonitoring', async () => { const t = vscode.window.activeTerminal; if (t) monitor.setActiveTerminal(monitor.registry.idOf(t)); await ui.show(); }),
    vscode.commands.registerCommand('terminalAgentTrafficLight.stopMonitoring', () => { monitor.stop(); void vscode.window.showInformationMessage('已停止终端监控'); }),
    vscode.commands.registerCommand('terminalAgentTrafficLight.showDashboard', () => ui.show()),
    vscode.commands.registerCommand('terminalAgentTrafficLight.replyYes', () => quick('confirmYes')),
    vscode.commands.registerCommand('terminalAgentTrafficLight.replyNo', () => quick('confirmNo')),
    vscode.commands.registerCommand('terminalAgentTrafficLight.openFloatingWindow', async () => { const result = await desktop.openWindow(); if (!result.success) void vscode.window.showErrorMessage(result.message); }),
    vscode.commands.registerCommand('terminalAgentTrafficLight.closeFloatingWindow', () => desktop.closeWindow())
  );
  async function quick(actionId: QuickReplyActionId): Promise<void> { const snapshot = store.getSnapshot(); if (!snapshot.activeTerminal || !snapshot.blockedPrompt) { void vscode.window.showWarningMessage('当前没有等待回复的问题'); return; } const result = await reply.reply({ requestId: `command-${Date.now()}`, terminalId: snapshot.activeTerminal.terminalId, blockId: snapshot.blockedPrompt.blockId, actionId }); if (!result.success) void vscode.window.showWarningMessage(result.message); }
}
