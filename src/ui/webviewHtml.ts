import * as vscode from 'vscode';
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview', 'styles.css'));
  const nonce = String(Date.now()) + Math.random().toString(36).slice(2);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"><title>Terminal Agent</title></head><body><main id="app" aria-live="polite"><div class="loading">正在连接终端监控…</div></main><script nonce="${nonce}" src="${script}"></script></body></html>`;
}
