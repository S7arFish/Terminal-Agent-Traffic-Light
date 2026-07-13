import type { MonitorStateSnapshot } from './state';
import type { BlockId, QuickReplyActionId, TerminalId } from './terminal';
export type ExtensionToWebviewMessage =
  | { type: 'STATE_SNAPSHOT'; payload: MonitorStateSnapshot }
  | { type: 'AUDIO_CUE'; payload: { cue: 'NORMAL' | 'BLOCKED' | 'ERROR'; stateRevision: number } }
  | { type: 'COMMAND_RESULT'; payload: { requestId: string; success: boolean; message: string } };
export type WebviewToExtensionMessage =
  | { type: 'WEBVIEW_READY' }
  | { type: 'REQUEST_QUICK_REPLY'; payload: { requestId: string; terminalId: TerminalId; blockId: BlockId; actionId: QuickReplyActionId } }
  | { type: 'SELECT_TERMINAL'; payload: { terminalId: TerminalId } }
  | { type: 'REQUEST_REFRESH' };
