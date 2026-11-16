#!/usr/bin/env node
'use strict';

// Launcher for `npm install -g @sapia/desktop`: starts Electron with the bundled app.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const main = path.join(__dirname, '..', 'dist', 'main.cjs');
if (!fs.existsSync(main)) {
  console.error('Sapia Desktop is not built. Run "npm run build" in the repository first.');
  process.exit(1);
}

let electron;
try {
  // In Node, the electron package exports the path of its binary.
  electron = require('electron');
} catch (error) {
  console.error('Electron could not be loaded. Reinstall with: npm install -g @sapia/desktop');
  console.error(String(error && error.message ? error.message : error));
  process.exit(1);
}

/**
 * Chromium's sandbox needs either unprivileged user namespaces or a setuid
 * helper. An npm installation cannot set up the helper, so on Linux systems
 * without user namespaces (and when running as root) Electron would refuse to start.
 */
function linuxNeedsNoSandbox() {
  if (process.platform !== 'linux') return false;
  if (process.env.SAPIA_NO_SANDBOX === '1') return true;
  if (typeof process.getuid === 'function' && process.getuid() === 0) return true;
  try {
    const helper = path.join(path.dirname(electron), 'chrome-sandbox');
    const stat = fs.statSync(helper);
    if (stat.uid === 0 && (stat.mode & 0o4000) !== 0) return false;
  } catch {
    /* no helper */
  }
  const read = (file) => {
    try {
      return fs.readFileSync(file, 'utf8').trim();
    } catch {
      return undefined;
    }
  };
  if (read('/proc/sys/kernel/unprivileged_userns_clone') === '0') return true;
  if (read('/proc/sys/user/max_user_namespaces') === '0') return true;
  if (read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1') return true;
  return false;
}

const args = [main, ...process.argv.slice(2)];
if (linuxNeedsNoSandbox()) {
  if (process.env.SAPIA_NO_SANDBOX !== '1') {
    console.warn('Sapia: the Chromium sandbox is not available on this system, starting without it.');
  }
  args.splice(1, 0, '--no-sandbox');
}

const child = spawn(electron, args, { stdio: 'inherit', windowsHide: false });
child.on('error', (error) => {
  console.error(`Sapia could not be started: ${error.message}`);
  process.exit(1);
});
child.on('close', (code, signal) => {
  if (code === null) {
    console.error(`Sapia exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
