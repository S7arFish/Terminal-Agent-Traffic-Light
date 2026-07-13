import { describe, expect, it } from 'vitest';
import { PromptDetector } from '../../src/detector/promptDetector';
const d = new PromptDetector(); const detect = (outputTail: string) => d.detect({ terminalId: 't1', outputTail, detectedAtEpochMs: 1 });
describe('PromptDetector', () => {
  it('detects a split yes/no prompt once chunks are combined', () => expect(detect('install package\nProceed? (y/n)')?.kind).toBe('YES_NO'));
  it('detects overwrite before generic y/n', () => expect(detect('Overwrite config.json? [Y/n]')?.kind).toBe('OVERWRITE'));
  it('does not treat historical prose as an active prompt', () => expect(detect('Documentation says: type Proceed? (y/n) then press enter.\nfinished')).toBeUndefined());
  it('shows auth without quick actions', () => expect(detect('Password: ')?.allowedActionIds).toEqual([]));
  it('includes nearby agent context instead of showing only the generic permission line', () => {
    const prompt = detect('Claude Code wants to run:\nnpm run test\nAllow this command?');
    expect(prompt?.questionText).toContain('npm run test');
    expect(prompt?.questionText).toContain('Allow this command?');
  });
  it('extracts numbered agent choices with their original labels', () => {
    const prompt = detect('Claude needs permission\nRun database migration?\n❯ 1. Yes, run it\n  2. Yes, and remember this choice\n  3. No, cancel');
    expect(prompt?.allowedActionIds).toEqual(['selectOption1', 'selectOption2', 'selectOption3']);
    expect(prompt?.actionLabels?.selectOption2).toBe('Yes, and remember this choice');
    expect(prompt?.questionText).toContain('Run database migration?');
  });
});
