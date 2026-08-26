import { closeSync, existsSync, openSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const appUrl = 'http://localhost:4321';
const healthUrl = `${appUrl}/api/health`;
const isWindows = process.platform === 'win32';

function fail(message) {
  console.error(`\nتعذر تشغيل عِش آمن: ${message}`);
  process.exit(1);
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    fail(`يلزم Node.js 22.5 أو أحدث. الإصدار الحالي: ${process.versions.node}`);
  }
}

function npmInvocation(args) {
  if (isWindows) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `npm ${args.join(' ')}`],
    };
  }
  return { command: 'npm', args };
}

function runNpm(args, label) {
  console.log(`\n${label}...`);
  const invocation = npmInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${label} لم يكتمل بنجاح`);
}

function newestModifiedTime(path) {
  if (!existsSync(path)) return 0;
  const info = statSync(path);
  if (!info.isDirectory()) return info.mtimeMs;
  return readdirSync(path, { withFileTypes: true }).reduce((latest, entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return latest;
    return Math.max(latest, newestModifiedTime(join(path, entry.name)));
  }, info.mtimeMs);
}

function ensureDependencies() {
  const serverReady = existsSync(join(rootDir, 'server', 'node_modules', 'express', 'package.json'));
  const frontendReady = existsSync(join(rootDir, 'frontend', 'node_modules', 'vite', 'package.json'));
  if (!serverReady || !frontendReady) runNpm(['run', 'install:all'], 'تثبيت المتطلبات للمرة الأولى');
}

function ensureFreshBuild() {
  const distIndex = join(rootDir, 'frontend', 'dist', 'index.html');
  const distTime = existsSync(distIndex) ? statSync(distIndex).mtimeMs : 0;
  const sourceTime = Math.max(
    newestModifiedTime(join(rootDir, 'frontend', 'src')),
    newestModifiedTime(join(rootDir, 'frontend', 'index.html')),
    newestModifiedTime(join(rootDir, 'frontend', 'package.json')),
    newestModifiedTime(join(rootDir, 'frontend', 'vite.config.ts')),
    newestModifiedTime(join(rootDir, 'frontend', 'tailwind.config.js')),
  );
  if (!distTime || sourceTime > distTime) runNpm(['run', 'build'], 'تجهيز آخر نسخة من الواجهة');
}

async function isReady() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.ok === true && data?.name === 'Aish Aman OS';
  } catch {
    return false;
  }
}

function startServer() {
  const stdout = openSync(join(rootDir, 'server', 'server-out.log'), 'a');
  const stderr = openSync(join(rootDir, 'server', 'server-err.log'), 'a');
  const invocation = npmInvocation(['start']);
  const child = spawn(invocation.command, invocation.args, {
    cwd: rootDir,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', stdout, stderr],
  });
  closeSync(stdout);
  closeSync(stderr);
  child.unref();
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function openBrowser() {
  if (process.env.AISH_AMAN_NO_OPEN === '1') return;
  const options = { detached: true, windowsHide: true, stdio: 'ignore' };
  if (isWindows) {
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'start', '', appUrl], options).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [appUrl], options).unref();
  } else {
    spawn('xdg-open', [appUrl], options).unref();
  }
}

assertNodeVersion();
ensureDependencies();
ensureFreshBuild();

if (!(await isReady())) {
  console.log('\nتشغيل عِش آمن...');
  startServer();
  if (!(await waitUntilReady())) {
    fail('الخدمة لم تصبح جاهزة. راجع server/server-err.log لمعرفة السبب.');
  }
}

console.log(`\nعِش آمن جاهز: ${appUrl}`);
openBrowser();

