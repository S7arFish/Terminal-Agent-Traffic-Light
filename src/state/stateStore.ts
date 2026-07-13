import type { BlockedPrompt, CommandSummary, TerminalDescriptor } from '../contracts/terminal';
import type { MonitorStateSnapshot, TrafficLightState } from '../contracts/state';

export class StateStore {
  private snapshot: MonitorStateSnapshot = { revision: 0, trafficLight: 'NO_TARGET', detailText: '尚未选择终端', changedAtEpochMs: Date.now() };
  private listeners = new Set<(snapshot: MonitorStateSnapshot) => void>();
  getSnapshot(): MonitorStateSnapshot { return this.snapshot; }
  subscribe(listener: (snapshot: MonitorStateSnapshot) => void): { dispose(): void } { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }
  setTarget(activeTerminal?: TerminalDescriptor): void { this.update({ activeTerminal, trafficLight: activeTerminal ? (activeTerminal.supportsShellIntegration ? 'NORMAL' : 'MONITOR_UNAVAILABLE') : 'NO_TARGET', detailText: activeTerminal ? (activeTerminal.supportsShellIntegration ? '正在监控终端输出' : '该终端没有可用的 Shell Integration。请启用 Shell Integration 后重试。') : '尚未选择终端', command: undefined, blockedPrompt: undefined }); }
  setNormal(command?: CommandSummary): void { this.update({ trafficLight: 'NORMAL', detailText: '命令正在运行，未发现需要回复的问题', command, blockedPrompt: undefined }); }
  setBlocked(blockedPrompt: BlockedPrompt, command: CommandSummary): void { this.update({ trafficLight: 'AWAITING_INPUT', detailText: '终端正在等待你的确认', blockedPrompt, command }); }
  setFailed(detailText: string, command?: CommandSummary): void { this.update({ trafficLight: 'COMMAND_FAILED', detailText, command, blockedPrompt: undefined }); }
  setEnded(command: CommandSummary): void { this.update({ trafficLight: 'COMMAND_ENDED', detailText: '命令已成功结束', command, blockedPrompt: undefined }); }
  setUnavailable(detailText: string): void { this.update({ trafficLight: 'MONITOR_UNAVAILABLE', detailText, blockedPrompt: undefined }); }
  setClosed(): void { this.update({ trafficLight: 'TERMINAL_CLOSED', detailText: '目标终端已关闭', blockedPrompt: undefined }); }
  private update(change: Partial<MonitorStateSnapshot>): void { this.snapshot = { ...this.snapshot, ...change, revision: this.snapshot.revision + 1, changedAtEpochMs: Date.now() }; for (const listener of this.listeners) listener(this.snapshot); }
}
