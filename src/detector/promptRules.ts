import type { PromptKind, QuickReplyActionId } from '../contracts/terminal';
export interface PromptRule { ruleId: string; kind: PromptKind; regex: RegExp; actions: QuickReplyActionId[]; }
export const promptRules: PromptRule[] = [
  { ruleId: 'permission', kind: 'PERMISSION', regex: /(?:allow (?:this |the )?(?:command|operation)|grant permission)[^\n?]*\?\s*$/i, actions: ['confirmYes', 'confirmNo'] },
  { ruleId: 'overwrite', kind: 'OVERWRITE', regex: /(?:overwrite|replace)[^\n?]*\?\s*(?:\[[Yy]\/n\]|\([Yy]\/n\))?\s*$/i, actions: ['confirmOverwrite', 'cancel'] },
  { ruleId: 'proceed', kind: 'YES_NO', regex: /(?:proceed|continue)[^\n?]*\?\s*(?:\([Yy]\/n\)|\[[Yy]\/n\]|\([Yy]es\/[Nn]o\))?\s*$/i, actions: ['confirmYes', 'confirmNo'] },
  { ruleId: 'yn-brackets', kind: 'YES_NO', regex: /[^\n]{0,600}(?:\[[Yy]\/n\]|\[[Yy]\/N\]|\([Yy]\/n\)|\([Yy]\/N\))\s*$/i, actions: ['confirmYes', 'confirmNo'] },
  { ruleId: 'auth', kind: 'AUTH', regex: /(?:password|passphrase|token|authentication code)\s*:\s*$/i, actions: [] }
];
