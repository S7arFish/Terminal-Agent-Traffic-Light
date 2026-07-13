import * as vscode from 'vscode';
import { OUTPUT_SCAN_TAIL_CHARACTERS } from '../config/defaults';
import type { BlockedPrompt, CommandSummary, TerminalId } from '../contracts/terminal';
import { sanitizeAnsi } from '../detector/ansiSanitizer';
import { PromptDetector } from '../detector/promptDetector';
import { RollingBuffer } from '../detector/rollingBuffer';

export class TerminalSession {
  private buffer: RollingBuffer;
  private current?: CommandSummary;
  private lastPromptFingerprint?: string;
  constructor(readonly terminalId: TerminalId, maxBuffer: number, private readonly detector: PromptDetector, private readonly onBlocked: (prompt: BlockedPrompt, command: CommandSummary) => void) { this.buffer = new RollingBuffer(maxBuffer); }
  startCommand(command: CommandSummary): void { this.current = command; this.buffer.clear(); this.lastPromptFingerprint = undefined; }
  appendOutput(rawChunk: string): void { if (!this.current) return; this.buffer.append(sanitizeAnsi(rawChunk)); const prompt = this.detector.detect({ terminalId: this.terminalId, outputTail: this.buffer.tail(OUTPUT_SCAN_TAIL_CHARACTERS), detectedAtEpochMs: Date.now() }); if (prompt) { const fingerprint = `${prompt.kind}:${prompt.questionText}`; if (fingerprint !== this.lastPromptFingerprint) { this.lastPromptFingerprint = fingerprint; this.onBlocked(prompt, this.current); } } }
  async consume(execution: vscode.TerminalShellExecution, cancellation: { cancelled: boolean }): Promise<void> { try { for await (const chunk of execution.read()) { if (cancellation.cancelled) break; this.appendOutput(chunk); } } catch { /* terminal output streams can end during teardown */ } }
  endCommand(exitCode: number | undefined): CommandSummary | undefined { if (!this.current) return undefined; const ended = { ...this.current, endedAtEpochMs: Date.now(), exitCode }; this.current = undefined; return ended; }
  dispose(): void { this.current = undefined; this.buffer.clear(); }
}
