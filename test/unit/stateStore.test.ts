import { describe, expect, it } from 'vitest';
import { StateStore } from '../../src/state/stateStore';
describe('StateStore', () => { it('increments revisions for every transition', () => { const s = new StateStore(); const a = s.getSnapshot().revision; s.setUnavailable('missing'); const b = s.getSnapshot().revision; s.setTarget(); expect([b, s.getSnapshot().revision]).toEqual([a + 1, a + 2]); }); });
