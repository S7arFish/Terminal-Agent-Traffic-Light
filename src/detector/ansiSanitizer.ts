/** Removes CSI/OSC controls while preserving printable terminal output. */
export function sanitizeAnsi(input: string): string {
  return input
    .replace(/\x1B\][\s\S]*?(?:\x07|\x1B\\)/g, '')
    .replace(/[\u001B\u009B][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '')
    .replace(/[\u0000\u0007]/g, '')
    .replace(/\r(?!\n)/g, '');
}
