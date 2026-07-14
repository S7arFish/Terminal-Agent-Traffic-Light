import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const releases = join(root, 'releases');
const appPath = join(releases, 'Agent Light.app');
const resources = join(appPath, 'Contents', 'Resources');
const appResources = join(resources, 'app');
const standalonePackage = JSON.parse(readFileSync(join(root, 'standalone', 'package.json'), 'utf8'));
const version = String(standalonePackage.version);
const bundleVersion = String(version.split('.').reduce((value, part) => value * 100 + Number(part), 0));
const dmgPath = join(releases, `Agent-Light-${version}-darwin-${process.arch}.dmg`);
const dmgRoot = join(releases, '.agent-light-dmg');

execFileSync('npm', ['run', 'vscode:prepublish'], { stdio: 'inherit' });
mkdirSync(releases, { recursive: true });
rmSync(appPath, { recursive: true, force: true });
rmSync(dmgPath, { force: true });
execFileSync('/usr/bin/ditto', [join(root, 'node_modules', 'electron', 'dist', 'Electron.app'), appPath]);
rmSync(join(resources, 'default_app.asar'), { force: true });
mkdirSync(appResources, { recursive: true });
for (const folder of ['desktop', 'dist', 'adapters']) cpSync(join(root, folder), join(appResources, folder), { recursive: true });
cpSync(join(root, 'standalone', 'package.json'), join(appResources, 'package.json'));
mkdirSync(join(appResources, 'scripts'), { recursive: true });
cpSync(join(root, 'scripts', 'install-agent-adapters.mjs'), join(appResources, 'scripts', 'install-agent-adapters.mjs'));
installIcon();
const plist = join(appPath, 'Contents', 'Info.plist');
setPlist(plist, 'CFBundleName', 'Agent Light');
setPlist(plist, 'CFBundleDisplayName', 'Agent Light');
setPlist(plist, 'CFBundleIdentifier', 'com.s7arfish.agent-light');
setPlist(plist, 'CFBundleShortVersionString', version);
setPlist(plist, 'CFBundleVersion', bundleVersion);
setPlist(plist, 'CFBundleExecutable', 'Agent Light');
for (const key of ['ElectronAsarIntegrity', 'NSAppTransportSecurity', 'NSBluetoothAlwaysUsageDescription', 'NSBluetoothPeripheralUsageDescription', 'NSCameraUsageDescription', 'NSMicrophoneUsageDescription']) deletePlist(plist, key);
const oldExecutable = join(appPath, 'Contents', 'MacOS', 'Electron');
const newExecutable = join(appPath, 'Contents', 'MacOS', 'Agent Light');
cpSync(oldExecutable, newExecutable);
rmSync(oldExecutable);
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
rmSync(dmgRoot, { recursive: true, force: true });
mkdirSync(dmgRoot);
try {
  execFileSync('/usr/bin/ditto', [appPath, join(dmgRoot, 'Agent Light.app')]);
  symlinkSync('/Applications', join(dmgRoot, 'Applications'));
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'Agent Light', '-srcfolder', dmgRoot, '-ov', '-format', 'UDZO', dmgPath], { stdio: 'inherit' });
} finally { rmSync(dmgRoot, { recursive: true, force: true }); }
process.stdout.write(`Packaged ${appPath}\nPackaged ${dmgPath}\n`);

function setPlist(path, key, value) {
  try { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, path]); }
  catch { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, path]); }
}
function deletePlist(path, key) { try { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, path], { stdio: 'ignore' }); } catch { /* inherited key was not present */ } }
function installIcon() {
  const work = join(releases, '.agent-light-icon');
  const iconset = join(work, 'AgentLight.iconset');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  try {
    execFileSync('/usr/bin/qlmanage', ['-t', '-s', '1024', '-o', work, join(root, 'resources', 'agent-light-icon.svg')], { stdio: 'ignore' });
    const source = join(work, 'agent-light-icon.svg.png');
    if (!existsSync(source)) return;
    for (const [name, size] of [['icon_16x16.png', 16], ['icon_16x16@2x.png', 32], ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64], ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256], ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512], ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024]]) execFileSync('/usr/bin/sips', ['-z', String(size), String(size), source, '--out', join(iconset, name)], { stdio: 'ignore' });
    execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'AgentLight.icns')]);
    setPlist(join(appPath, 'Contents', 'Info.plist'), 'CFBundleIconFile', 'AgentLight.icns');
  } finally { rmSync(work, { recursive: true, force: true }); }
}
