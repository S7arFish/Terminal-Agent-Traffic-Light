import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
const watch = process.argv.includes('--watch');
if (!watch) rmSync('dist', { recursive: true, force: true });
const common = { bundle: true, sourcemap: true, minify: !watch, logLevel: 'info' };
const extension = { ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', platform: 'node', format: 'cjs', external: ['vscode'] };
const webview = { ...common, entryPoints: ['webview/main.ts'], outfile: 'dist/webview.js', platform: 'browser', format: 'iife' };
const desktopMain = { ...common, entryPoints: ['desktop/main.ts'], outfile: 'dist/desktop-main.js', platform: 'node', format: 'cjs', external: ['electron'] };
const desktopPreload = { ...common, entryPoints: ['desktop/preload.ts'], outfile: 'dist/desktop-preload.js', platform: 'node', format: 'cjs', external: ['electron'] };
const desktopRenderer = { ...common, entryPoints: ['desktop/renderer.ts'], outfile: 'dist/desktop-renderer.js', platform: 'browser', format: 'iife' };
const builds = [extension, webview, desktopMain, desktopPreload, desktopRenderer];
if (watch) { for (const build of builds) await esbuild.context(build).then(x => x.watch()); } else { for (const build of builds) await esbuild.build(build); }
