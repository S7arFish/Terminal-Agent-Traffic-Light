import { describe, expect, it } from 'vitest';
import { RollingBuffer } from '../../src/detector/rollingBuffer';
describe('RollingBuffer', () => { it('retains only its configured tail across chunks', () => { const b = new RollingBuffer(5); b.append('abc'); b.append('def'); expect(b.text).toBe('bcdef'); expect(b.tail(3)).toBe('def'); }); });
