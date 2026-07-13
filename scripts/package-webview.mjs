import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
cpSync('webview/styles.css', 'dist/styles.css');
