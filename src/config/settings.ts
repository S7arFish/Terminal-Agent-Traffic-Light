import * as vscode from 'vscode';
import { DEFAULT_MAX_BUFFERED_CHARACTERS } from './defaults';
export interface Settings { enabled: boolean; autoSelectActiveTerminal: boolean; playSound: boolean; maxBufferedCharacters: number; customPromptPatterns: string[]; showCompletionAsRed: boolean; autoOpenFloatingWindow: boolean; }
export function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration('terminalAgentTrafficLight');
  const number = c.get<unknown>('maxBufferedCharacters');
  const patterns = c.get<unknown>('customPromptPatterns');
  return {
    enabled: c.get<unknown>('enabled') !== false,
    autoSelectActiveTerminal: c.get<unknown>('autoSelectActiveTerminal') !== false,
    playSound: c.get<unknown>('playSound') !== false,
    maxBufferedCharacters: typeof number === 'number' && Number.isFinite(number) ? Math.min(100_000, Math.max(1_000, Math.floor(number))) : DEFAULT_MAX_BUFFERED_CHARACTERS,
    customPromptPatterns: Array.isArray(patterns) ? patterns.filter((x): x is string => typeof x === 'string').slice(0, 30) : [],
    showCompletionAsRed: c.get<unknown>('showCompletionAsRed') !== false,
    autoOpenFloatingWindow: c.get<unknown>('autoOpenFloatingWindow') === true
  };
}
