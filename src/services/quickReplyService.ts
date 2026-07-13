import type { QuickReplyActionId, TerminalId, BlockId } from '../contracts/terminal';
import { quickReplyActions } from '../contracts/terminal';
import { StateStore } from '../state/stateStore';
import { TerminalRegistry } from '../monitor/terminalRegistry';
export class QuickReplyService {
  constructor(private readonly store: StateStore, private readonly registry: TerminalRegistry) {}
  async reply(request: { requestId: string; terminalId: TerminalId; blockId: BlockId; actionId: QuickReplyActionId }): Promise<{ success: boolean; message: string }> {
    const state = this.store.getSnapshot();
    if (state.trafficLight !== 'AWAITING_INPUT' || !state.activeTerminal || !state.blockedPrompt) return { success: false, message: '当前没有等待回复的问题' };
    if (request.terminalId !== state.activeTerminal.terminalId || request.blockId !== state.blockedPrompt.blockId) return { success: false, message: '提示已过期，未向终端写入任何内容' };
    if (!state.blockedPrompt.allowedActionIds.includes(request.actionId)) return { success: false, message: '该操作不适用于当前提示' };
    const terminal = this.registry.get(request.terminalId); const action = quickReplyActions[request.actionId];
    if (!terminal || !action) return { success: false, message: '目标终端已关闭' };
    terminal.sendText(action.terminalText, action.shouldExecute);
    return { success: true, message: `已发送${state.blockedPrompt.actionLabels?.[request.actionId] ?? action.label}` };
  }
}
