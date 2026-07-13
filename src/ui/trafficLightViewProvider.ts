import * as vscode from 'vscode';
import { webviewHtml } from './webviewHtml';
export class TrafficLightViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly emitter = new vscode.EventEmitter<vscode.Webview>();
  readonly onDidResolve = this.emitter.event;
  constructor(private readonly extensionUri: vscode.Uri) {}
  resolveWebviewView(view: vscode.WebviewView): void { this.view = view; view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'webview')] }; view.webview.html = webviewHtml(view.webview, this.extensionUri); this.emitter.fire(view.webview); view.onDidDispose(() => { if (this.view === view) this.view = undefined; }); }
  postMessage(message: unknown): Thenable<boolean> | undefined { return this.view?.webview.postMessage(message); }
  onMessage(listener: (message: unknown) => void): vscode.Disposable | undefined { return this.view?.webview.onDidReceiveMessage(listener); }
}
