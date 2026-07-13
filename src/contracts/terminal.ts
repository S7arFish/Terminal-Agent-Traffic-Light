export type TerminalId = string;
export type BlockId = string;
export type PromptKind = 'YES_NO' | 'OVERWRITE' | 'PERMISSION' | 'AUTH' | 'UNKNOWN';
export type QuickReplyActionId = 'confirmYes' | 'confirmNo' | 'confirmOverwrite' | 'cancel' | 'selectOption1' | 'selectOption2' | 'selectOption3' | 'selectOption4' | 'selectOption5';

export interface TerminalDescriptor { terminalId: TerminalId; name: string; isActive: boolean; supportsShellIntegration: boolean; }
export interface BlockedPrompt { blockId: BlockId; terminalId: TerminalId; kind: PromptKind; questionText: string; detectedAtEpochMs: number; allowedActionIds: QuickReplyActionId[]; actionLabels?: Partial<Record<QuickReplyActionId, string>>; }
export interface CommandSummary { commandId: string; terminalId: TerminalId; startedAtEpochMs: number; endedAtEpochMs?: number; exitCode?: number; }
export interface QuickReplyAction { id: QuickReplyActionId; label: string; terminalText: string; shouldExecute: true; }
export const quickReplyActions: Record<QuickReplyActionId, QuickReplyAction> = {
  confirmYes: { id: 'confirmYes', label: '是（y）', terminalText: 'y', shouldExecute: true },
  confirmNo: { id: 'confirmNo', label: '否（n）', terminalText: 'n', shouldExecute: true },
  confirmOverwrite: { id: 'confirmOverwrite', label: '覆盖（y）', terminalText: 'y', shouldExecute: true },
  cancel: { id: 'cancel', label: '取消', terminalText: 'n', shouldExecute: true },
  selectOption1: { id: 'selectOption1', label: '选项 1', terminalText: '', shouldExecute: true },
  selectOption2: { id: 'selectOption2', label: '选项 2', terminalText: '\u001b[B', shouldExecute: true },
  selectOption3: { id: 'selectOption3', label: '选项 3', terminalText: '\u001b[B\u001b[B', shouldExecute: true },
  selectOption4: { id: 'selectOption4', label: '选项 4', terminalText: '\u001b[B\u001b[B\u001b[B', shouldExecute: true },
  selectOption5: { id: 'selectOption5', label: '选项 5', terminalText: '\u001b[B\u001b[B\u001b[B\u001b[B', shouldExecute: true }
};
