import { describe, expect, it } from 'vitest';
import { sanitizeAnsi } from '../../src/detector/ansiSanitizer';
describe('sanitizeAnsi', () => { it('removes colored escape sequences', () => expect(sanitizeAnsi('\u001b[31mProceed? (y/n)\u001b[0m')).toBe('Proceed? (y/n)')); });
