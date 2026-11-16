#!/usr/bin/env node
'use strict';

// Launcher for `npm install -g @sapia/desktop`: starts Electron with the bundled app.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  // Answered here so that asking for the version does not start Electron.
  console.log(require('../package.json').version);
  process.exit(0);
}

const main = path.join(__dirname, '..', 'dist', 'main.cjs');
if (!fs.existsSync(main)) {
  console.error('Sapia Desktop is not built. Run "npm run build" in the repository first.');
  process.exit(1);
}

const read = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return undefined;
  }
};

const german = /^de(?:[_.@-]|$)/i.test(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '');
const say = (en, de) => (german ? de : en);

/** Relative path of the Electron executable inside an Electron distribution. */
function executableIn(platform) {
  switch (platform) {
    case 'darwin':
      return path.join('Electron.app', 'Contents', 'MacOS', 'Electron');
    case 'win32':
      return 'electron.exe';
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return 'electron';
    default:
      throw new SetupError(say(`Electron is not available for ${platform}.`, `Electron gibt es nicht für ${platform}.`));
  }
}

class SetupError extends Error {}

/**
 * Proxy settings: the usual environment variables, else the proxy npm is
 * configured with (so that whatever made `npm install` work also works here).
 */
function configureProxy() {
  const env = process.env;
  const fromEnv = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (fromEnv) return fromEnv;
  const npmConfig = (key) => {
    try {
      const value = require('node:child_process')
        // Run from the home folder: inside an npm workspace `npm config get` refuses to work.
        .execSync(`npm config get ${key}`, { cwd: require('node:os').homedir(), stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, shell: true })
        .toString()
        .trim();
      return value && value !== 'null' && value !== 'undefined' ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const proxy = npmConfig('https-proxy') || npmConfig('proxy');
  if (!proxy) return undefined;
  env.HTTPS_PROXY = env.HTTPS_PROXY || proxy;
  env.HTTP_PROXY = env.HTTP_PROXY || proxy;
  const noProxy = npmConfig('noproxy');
  if (noProxy && !env.NO_PROXY && !env.no_proxy) env.NO_PROXY = noProxy;
  return proxy;
}

const isCertificateError = (error) =>
  /certificate|self[- ]signed|UNABLE_TO_GET_ISSUER|CERT_/i.test(`${error && error.message} ${error && error.cause && (error.cause.code || error.cause.message)} ${error && error.code}`);

/**
 * Company proxies that inspect TLS re-sign traffic with their own root
 * certificate, which the operating system trusts but Node does not by
 * default. Start once more trusting the system store and npm's `cafile`.
 */
function retryWithSystemCertificates() {
  const env = { ...process.env, SAPIA_TLS_RETRY: '1' };
  let cafile;
  try {
    cafile = require('node:child_process')
      .execSync('npm config get cafile', { cwd: require('node:os').homedir(), stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, shell: true })
      .toString()
      .trim();
  } catch {
    /* npm not available */
  }
  if (cafile && cafile !== 'null' && cafile !== 'undefined' && !env.NODE_EXTRA_CA_CERTS) env.NODE_EXTRA_CA_CERTS = cafile;
  console.log(say('Sapia: the certificate was not trusted, retrying with the certificates of the operating system …', 'Sapia: dem Zertifikat wurde nicht vertraut, neuer Versuch mit den Zertifikaten des Betriebssystems …'));
  const result = require('node:child_process').spawnSync(process.execPath, ['--use-system-ca', __filename, ...process.argv.slice(2)], { stdio: 'inherit', env });
  process.exit(result.status ?? 1);
}

/** Explains a failed download in terms of what the user can do about it. */
function explainDownloadError(error, { version, platform, arch, proxy }) {
  const text = [error && error.message, error && error.cause && (error.cause.code || error.cause.message)].filter(Boolean).join(' – ');
  const code = (error && error.cause && error.cause.code) || (error && error.code) || '';
  const mirror = process.env.ELECTRON_MIRROR;
  const source = mirror || 'https://github.com/electron/electron/releases';
  const lines = [say(`Sapia could not download Electron ${version} (${platform}-${arch}) from ${source}.`, `Sapia konnte Electron ${version} (${platform}-${arch}) nicht von ${source} laden.`), `  ${text}`, ''];
  const hint = (en, de) => lines.push(`  • ${say(en, de)}`);

  if (isCertificateError(error)) {
    hint(
      'The TLS certificate was not trusted, not even with the certificates of the operating system. Behind a company proxy that inspects TLS, point Sapia to its root certificate: NODE_EXTRA_CA_CERTS=/path/to/company-ca.pem sapia (or set it for npm: npm config set cafile /path/to/company-ca.pem).',
      'Dem TLS-Zertifikat wurde nicht vertraut, auch nicht mit den Zertifikaten des Betriebssystems. Hinter einem Firmen-Proxy, der TLS aufbricht, Sapia dessen Root-Zertifikat geben: NODE_EXTRA_CA_CERTS=/pfad/zu/firmen-ca.pem sapia (oder für npm setzen: npm config set cafile /pfad/zu/firmen-ca.pem).',
    );
  } else if (/\b407\b/.test(text)) {
    hint('The proxy requires authentication: put the credentials into the proxy URL, e.g. HTTPS_PROXY=http://user:password@proxy:8080.', 'Der Proxy verlangt eine Anmeldung: Zugangsdaten in die Proxy-URL schreiben, z. B. HTTPS_PROXY=http://benutzer:passwort@proxy:8080.');
  } else if (/\b404\b/.test(text) && mirror) {
    hint(`The mirror does not have this file. ELECTRON_MIRROR must point to a copy of the GitHub releases (…/v${version}/electron-v${version}-${platform}-${arch}.zip must exist).`, `Der Spiegel hat diese Datei nicht. ELECTRON_MIRROR muss auf eine Kopie der GitHub-Releases zeigen (…/v${version}/electron-v${version}-${platform}-${arch}.zip muss existieren).`);
  } else if (/checksum|sha256|integrity/i.test(text)) {
    hint('The downloaded file was damaged or altered on the way (checksum mismatch). Try again; if it persists, a proxy may be rewriting downloads.', 'Die geladene Datei wurde unterwegs beschädigt oder verändert (Prüfsumme stimmt nicht). Nochmal versuchen; falls es bleibt, verändert evtl. ein Proxy Downloads.');
  } else if (proxy) {
    hint(`The download went through the proxy ${proxy.replace(/\/\/[^@/]*@/, '//***@')}, which refused or could not reach the server. Ask your IT to allow ${new URL(source).host}, or use an internal mirror (ELECTRON_MIRROR).`, `Der Download lief über den Proxy ${proxy.replace(/\/\/[^@/]*@/, '//***@')}, der die Verbindung abgelehnt hat oder den Server nicht erreicht. Die IT bitten, ${new URL(source).host} freizugeben, oder einen internen Spiegel nutzen (ELECTRON_MIRROR).`);
  } else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENETUNREACH|fetch failed|UND_ERR/i.test(text + code)) {
    hint('No connection. If your network needs a proxy, set HTTPS_PROXY (and NO_PROXY), e.g. HTTPS_PROXY=http://proxy.example.com:8080 sapia. Sapia also uses the proxy configured for npm (npm config get https-proxy).', 'Keine Verbindung. Falls dein Netz einen Proxy braucht, HTTPS_PROXY (und NO_PROXY) setzen, z. B. HTTPS_PROXY=http://proxy.example.com:8080 sapia. Sapia nutzt auch den für npm eingestellten Proxy (npm config get https-proxy).');
  }
  hint('Company mirror (Artifactory, Nexus, …): ELECTRON_MIRROR=https://mirror.example.com/electron/', 'Firmen-Spiegel (Artifactory, Nexus, …): ELECTRON_MIRROR=https://spiegel.example.com/electron/');
  hint(`Or use an Electron ${version} you already have: SAPIA_ELECTRON_PATH=/path/to/electron`, `Oder ein vorhandenes Electron ${version} nutzen: SAPIA_ELECTRON_PATH=/pfad/zu/electron`);
  return new SetupError(lines.join('\n'));
}

/**
 * Finds the Electron executable, downloading it on the first start.
 *
 * The electron npm package downloads its binary on first use into its own
 * folder, which usually belongs to root after `npm install -g`, so the
 * download fails for a normal user. Sapia downloads it itself into a folder
 * the user owns (~/.sapia/electron), using Electron's downloader (cache,
 * checksums, ELECTRON_MIRROR) with proxy support switched on.
 */
async function resolveElectron() {
  if (process.env.SAPIA_ELECTRON_PATH) return process.env.SAPIA_ELECTRON_PATH;

  const packageJson = require.resolve('electron/package.json');
  const packageDir = path.dirname(packageJson);
  const { version } = require(packageJson);
  const { platform, arch } = process;
  const executable = executableIn(platform);

  // A binary the electron package already has (development checkout, local install).
  const bundled = path.join(packageDir, 'dist', executable);
  if (read(path.join(packageDir, 'dist', 'version'))?.replace(/^v/, '') === version && fs.existsSync(bundled)) return bundled;

  const home = process.env.SAPIA_HOME || path.join(require('node:os').homedir(), '.sapia');
  const target = path.join(home, 'electron', `${version}-${platform}-${arch}`);
  const installed = path.join(target, executable);
  if (read(path.join(target, '.complete')) === version && fs.existsSync(installed)) return installed;

  if (!process.env.SAPIA_TLS_RETRY) console.log(say(`Sapia: downloading Electron ${version} for ${platform}-${arch} (about 110 MB, only on the first start) …`, `Sapia: lade Electron ${version} für ${platform}-${arch} (ca. 110 MB, nur beim ersten Start) …`));
  const proxy = configureProxy();
  const { createRequire } = require('node:module');
  const { pathToFileURL } = require('node:url');
  const fromElectron = createRequire(packageJson);
  const get = await import(pathToFileURL(fromElectron.resolve('@electron/get')).href);
  if (proxy && !process.env.ELECTRON_GET_USE_PROXY) get.initializeProxy();

  let zip;
  // Some network failures surface as exceptions thrown from inside the HTTP
  // client instead of a rejected promise; report them the same way.
  let crashed;
  const crash = new Promise((_, reject) => {
    crashed = (error) => reject(error);
    process.on('uncaughtException', crashed);
  });
  try {
    zip = await Promise.race([crash, get.downloadArtifact({
      version,
      artifactName: 'electron',
      platform,
      arch,
      checksums: JSON.parse(fs.readFileSync(path.join(packageDir, 'checksums.json'), 'utf8')),
      cacheRoot: process.env.electron_config_cache,
    })]);
  } catch (error) {
    if (isCertificateError(error) && !process.env.SAPIA_TLS_RETRY) retryWithSystemCertificates();
    throw explainDownloadError(error, { version, platform, arch, proxy });
  } finally {
    process.off('uncaughtException', crashed);
  }

  const { extract } = await import(pathToFileURL(fromElectron.resolve('@electron-internal/extract-zip')).href);
  const partial = `${target}.partial-${process.pid}`;
  try {
    fs.rmSync(partial, { recursive: true, force: true });
    fs.mkdirSync(partial, { recursive: true });
    await extract(zip, { dir: partial });
    fs.writeFileSync(path.join(partial, '.complete'), version);
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(partial, target);
  } catch (error) {
    fs.rmSync(partial, { recursive: true, force: true });
    throw new SetupError(say(`Sapia could not unpack Electron into ${target}: ${error.message}`, `Sapia konnte Electron nicht nach ${target} entpacken: ${error.message}`));
  }
  console.log(say('Sapia: Electron is ready.', 'Sapia: Electron ist bereit.'));
  return installed;
}

/**
 * Chromium's sandbox needs either unprivileged user namespaces or a setuid
 * helper. An npm installation cannot set up the helper, so on Linux systems
 * without user namespaces (and when running as root) Electron would refuse to start.
 */
function linuxNeedsNoSandbox(electron) {
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
  if (read('/proc/sys/kernel/unprivileged_userns_clone') === '0') return true;
  if (read('/proc/sys/user/max_user_namespaces') === '0') return true;
  if (read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1') return true;
  return false;
}

function start(electron) {
  const args = [main, ...process.argv.slice(2)];
  if (linuxNeedsNoSandbox(electron)) {
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
}

resolveElectron().then(start, (error) => {
  console.error(error instanceof SetupError ? error.message : say(`Sapia could not set up Electron: ${error && error.stack ? error.stack : error}`, `Sapia konnte Electron nicht einrichten: ${error && error.stack ? error.stack : error}`));
  process.exit(1);
});
