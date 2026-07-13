const assert = require('node:assert');
const vscode = require('vscode');
suite('Terminal Agent Traffic Light', () => {
  test('extension activates and registers its dashboard command', async () => {
    const extension = vscode.extensions.getExtension('local.terminal-agent-traffic-light');
    assert.ok(extension, 'extension should be discoverable');
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('terminalAgentTrafficLight.showDashboard'));
  });
});
