import { MAX_QUESTION_CHARACTERS } from '../config/defaults';
import type { BlockedPrompt, PromptKind, QuickReplyActionId, TerminalId } from '../contracts/terminal';
import { promptRules } from './promptRules';
export class PromptDetector {
  private readonly customRules;
  constructor(customPatterns: string[] = []) {
    this.customRules = customPatterns.flatMap((pattern, index) => {
      try { return [{ ruleId: `custom-${index}`, kind: 'UNKNOWN' as const, regex: new RegExp(`(?:${pattern})\\s*$`, 'i'), actions: [] as [] }]; } catch { return []; }
    });
  }
  detect(input: { terminalId: TerminalId; outputTail: string; detectedAtEpochMs: number }): BlockedPrompt | undefined {
    const tail = input.outputTail.replace(/\r/g, '');
    const numbered = detectNumberedChoice(tail);
    if (numbered) return createPrompt(input, numbered.kind, 'numbered-choice', numbered.questionText, numbered.actions, numbered.labels);
    for (const rule of [...promptRules, ...this.customRules]) {
      const match = rule.regex.exec(tail);
      if (!match || match.index + match[0].length !== tail.length) continue;
      const question = extractContext(tail, match.index).slice(-MAX_QUESTION_CHARACTERS);
      return createPrompt(input, rule.kind, rule.ruleId, question, rule.actions);
    }
    return undefined;
  }
}

function createPrompt(input: { terminalId: TerminalId; detectedAtEpochMs: number }, kind: PromptKind, ruleId: string, questionText: string, allowedActionIds: QuickReplyActionId[], actionLabels?: Partial<Record<QuickReplyActionId, string>>): BlockedPrompt {
  return { blockId: `${input.terminalId}:${ruleId}:${questionText}:${input.detectedAtEpochMs}`, terminalId: input.terminalId, kind, questionText, detectedAtEpochMs: input.detectedAtEpochMs, allowedActionIds, actionLabels };
}
function extractContext(tail: string, matchIndex: number): string {
  const start = Math.max(0, matchIndex - 1_200);
  return tail.slice(start).split('\n').slice(-10).join('\n').trim();
}
function detectNumberedChoice(tail: string): { kind: PromptKind; questionText: string; actions: QuickReplyActionId[]; labels: Partial<Record<QuickReplyActionId, string>> } | undefined {
  const lines = tail.split('\n').map(line => line.trimEnd());
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  const options: Array<{ number: number; label: string }> = [];
  let index = lines.length - 1;
  for (; index >= 0; index -= 1) {
    const match = /^[\s›❯>●○]*([1-5])[.)]\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) break;
    options.unshift({ number: Number(match[1]), label: match[2].trim().slice(0, 160) });
  }
  if (options.length < 2 || options.some((option, optionIndex) => option.number !== optionIndex + 1)) return undefined;
  let questionIndex = index;
  while (questionIndex >= 0 && !lines[questionIndex].includes('?')) questionIndex -= 1;
  if (questionIndex < 0) return undefined;
  const contextLines = lines.slice(Math.max(0, questionIndex - 4), index + 1);
  const questionText = contextLines.join('\n').trim().slice(-MAX_QUESTION_CHARACTERS);
  const actions = options.map(option => `selectOption${option.number}` as QuickReplyActionId);
  const labels: Partial<Record<QuickReplyActionId, string>> = {};
  for (const option of options) labels[`selectOption${option.number}` as QuickReplyActionId] = option.label;
  const kind: PromptKind = /allow|permission|权限/i.test(questionText) ? 'PERMISSION' : 'UNKNOWN';
  return { kind, questionText, actions, labels };
}
