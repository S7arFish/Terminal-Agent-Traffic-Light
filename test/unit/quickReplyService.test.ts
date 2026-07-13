import { describe, expect, it } from 'vitest';
import { QuickReplyService } from '../../src/services/quickReplyService';
import { StateStore } from '../../src/state/stateStore';
import { TerminalRegistry } from '../../src/monitor/terminalRegistry';
describe('QuickReplyService', () => { it('rejects replies without an active blocked prompt', async () => { const r = await new QuickReplyService(new StateStore(), new TerminalRegistry()).reply({ requestId: 'r', terminalId: 't', blockId: 'b', actionId: 'confirmYes' }); expect(r.success).toBe(false); }); });
