import type { BlockedPrompt, CommandSummary, TerminalDescriptor } from './terminal';
export type TrafficLightState = 'NORMAL' | 'AWAITING_INPUT' | 'COMMAND_FAILED' | 'COMMAND_ENDED' | 'TERMINAL_CLOSED' | 'MONITOR_UNAVAILABLE' | 'NO_TARGET';
export interface MonitorStateSnapshot { revision: number; activeTerminal?: TerminalDescriptor; trafficLight: TrafficLightState; command?: CommandSummary; blockedPrompt?: BlockedPrompt; detailText: string; changedAtEpochMs: number; }
