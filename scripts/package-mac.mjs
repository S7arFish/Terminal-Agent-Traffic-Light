import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const resources = join(root, 'resources');
const archive = join(resources, 'electron-darwin-arm64.zip');
const output = join(root, 'releases', 'terminal-agent-traffic-light-0.2.0-darwin-arm64.vsix');

mkdirSync(resources, { recursive: true });
mkdirSync(join(root, 'releases'), { recursive: true });
rmSync(archive, { force: true });
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', join(root, 'node_modules/electron/dist/Electron.app'), archive], { stdio: 'inherit' });
execFileSync('npx', ['@vscode/vsce', 'package', '--no-dependencies', '--target', 'darwin-arm64', '--allow-missing-repository', '--out', output], { stdio: 'inherit' });
