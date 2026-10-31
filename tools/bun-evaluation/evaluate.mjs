import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const label = process.env.EVALUATION_LABEL || process.platform;
if (!/^[a-z][a-z0-9-]*$/.test(label)) throw new Error('Invalid evaluation label');
const runs = Number(process.env.EVALUATION_RUNS || 5);
const e2eRuns = Number(process.env.EVALUATION_E2E_RUNS || runs);
if (!Number.isInteger(runs) || runs < 1 || runs > 5 || !Number.isInteger(e2eRuns) || e2eRuns < 0 || e2eRuns > runs) throw new Error('Use 1–5 runs and 0–runs E2E runs');
const modes = (process.env.EVALUATION_MODES || 'npm-node,bun-node,bun-bun').split(',');
if (modes.some(mode => !['npm-node', 'bun-node', 'bun-bun'].includes(mode))) throw new Error('Invalid evaluation mode');
const sample = 'tools/bun-evaluation/sample';
const projects = ['.', 'tools/api-types', sample];
const base = path.join(root, 'tmp/bun-evaluation', label);
const resultDir = path.join(root, 'tmp/bun-evaluation/results', label);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:43122';
if (!['127.0.0.1', 'localhost', 'web'].includes(new URL(baseURL).hostname)) throw new Error('Use only the isolated test app');
await rm(resultDir, { recursive: true, force: true });
await mkdir(resultDir, { recursive: true });
let logNumber = 0;
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(),
  sourceRevision: process.env.EVALUATION_REVISION || null,
  environment: { platform: process.platform, arch: process.arch, osRelease: os.release(), cpus: os.cpus().length, node: process.version },
  runs, e2eRuns, modes: {}, measurements: [],
};

function launch(args, options = {}) {
  return spawn(args[0], args.slice(1), { cwd: options.cwd || root, env: { ...process.env, ...options.env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
}
function stop(child, signal = 'SIGTERM') {
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function command(args, options = {}) {
  const started = performance.now();
  const child = launch(args, options);
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => stop(child, 'SIGKILL'), options.timeout || 180_000);
  let status;
  try { status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); }
  finally { clearTimeout(timer); }
  const log = `${String(++logNumber).padStart(3, '0')}.log`;
  await writeFile(path.join(resultDir, log), output);
  const result = { seconds: (performance.now() - started) / 1000, status, log, command: args };
  if (status !== 0) { const error = new Error(`${args.join(' ')} failed (${status})\n${output.slice(-3000)}`); error.result = result; throw error; }
  return result;
}
function record(mode, iteration, metric, result, extra = {}) {
  report.measurements.push({ mode, iteration, metric, ...result, ...extra });
  console.log(`${label} ${mode} ${iteration} ${metric}: ${result.seconds.toFixed(3)}s`);
}
async function save() { await writeFile(path.join(resultDir, 'results.json'), JSON.stringify(report, null, 2) + '\n'); }

const nodeVersion = await command(['node', '--version']);
const bunVersion = await command(['bun', '--version']);
report.environment.node = (await readFile(path.join(resultDir, nodeVersion.log), 'utf8')).trim();
report.environment.bun = (await readFile(path.join(resultDir, bunVersion.log), 'utf8')).trim();
report.environment.npm = (await command(['npm', '--version'])).log;
report.environment.npm = (await readFile(path.join(resultDir, report.environment.npm), 'utf8')).trim();
if (report.environment.bun !== '1.4.4' || report.environment.node !== 'v24.22.1') throw new Error('Use Bun 1.4.4 and Node 24.22.1 for this comparison');
const snapshots = {};
const sources = ['package.json', 'package-lock.json', 'tsconfig.json', 'playwright.config.ts', 'e2e', 'types', 'docs/api/v1/openapi.json', 'tools/api-types', sample, 'tools/bun-evaluation/runtime-trace.cjs'];
for (const mode of modes) {
  const directory = path.join(base, mode);
  await rm(directory, { recursive: true, force: true });
  for (const source of sources) {
    await cp(path.join(root, source), path.join(directory, source), { recursive: true, filter: file => !file.split(path.sep).some(part => ['node_modules', 'dist'].includes(part)) });
  }
  snapshots[mode] = directory;
  report.modes[mode] = { compatible: null };
  if (mode.startsWith('bun')) {
    for (const project of projects) await command(['bun', 'install', '--lockfile-only'], { cwd: path.join(directory, project), env: { BUN_INSTALL_CACHE_DIR: path.join(directory, '.migration-cache') } });
  }
}
const browser = await chromium.launch({ headless: true });
const runtimeCommand = (mode, directory, script, args = []) => [mode === 'bun-bun' ? 'bun' : 'node', mode === 'bun-bun' ? '--preload' : '--require', path.join(directory, 'tools/bun-evaluation/runtime-trace.cjs'), script, ...args];

async function dependencyGraph(directory) {
  const found = new Set();
  async function walk(moduleDirectory) {
    let entries;
    try { entries = await readdir(moduleDirectory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name.startsWith('@')) { await walk(path.join(moduleDirectory, entry.name)); continue; }
      const folder = path.join(moduleDirectory, entry.name);
      try {
        const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
        found.add(`${pkg.name}@${pkg.version}`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await walk(path.join(folder, 'node_modules'));
    }
  }
  await walk(path.join(directory, 'node_modules'));
  return [...found].sort();
}
async function install(mode, directory, iteration, cache) {
  const cacheDirectory = path.join(directory, `.cache-${iteration}`);
  if (cache === 'cold') await rm(cacheDirectory, { recursive: true, force: true });
  let seconds = 0;
  const logs = [];
  for (const project of projects) {
    const cwd = path.join(directory, project);
    await rm(path.join(cwd, 'node_modules'), { recursive: true, force: true });
    const args = mode === 'npm-node' ? ['npm', 'ci', '--no-audit', '--no-fund', '--cache', cacheDirectory] : ['bun', 'install', '--frozen-lockfile'];
    const result = await command(args, { cwd, env: { BUN_INSTALL_CACHE_DIR: cacheDirectory } });
    seconds += result.seconds; logs.push(result.log);
  }
  record(mode, iteration, `install_${cache}`, { seconds, logs });
}
async function devSmoke(mode, directory, iteration, cache) {
  const cwd = path.join(directory, sample);
  if (cache === 'cold') await rm(path.join(cwd, 'node_modules/.vite'), { recursive: true, force: true });
  const started = performance.now();
  const child = launch(runtimeCommand(mode, directory, path.join(cwd, 'node_modules/vite/bin/vite.js')), { cwd, env: { EVALUATION_TRACE: path.join(resultDir, `${mode}-runtime.jsonl`) } });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const appFile = path.join(cwd, 'src/App.tsx');
  const original = await readFile(appFile, 'utf8');
  try {
    const url = 'http://127.0.0.1:45173/bun-evaluation/';
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try { ready = (await fetch(url)).ok; } catch {}
      if (ready) break;
      if (child.exitCode !== null) throw new Error(`Vite exited: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Vite did not start: ${output}`);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Bun比較検証' })).toBeVisible();
    record(mode, iteration, `dev_${cache}`, { seconds: (performance.now() - started) / 1000 });
    if (iteration === 1 && cache === 'cold') {
      await page.getByRole('button').click();
      await page.evaluate(() => { window.__evaluationDocument = 'same-document'; });
      await writeFile(appFile, original.replace('Bun比較検証', '更新を確認'));
      await expect(page.getByRole('heading', { name: '更新を確認' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('カウント: 1');
      expect(await page.evaluate(() => window.__evaluationDocument)).toBe('same-document');
      report.modes[mode].hmrAndReactRefresh = true;
    }
    expect(errors).toEqual([]);
  } finally {
    await writeFile(appFile, original); await context.close();
    const exited = new Promise(resolve => child.once('close', resolve));
    stop(child); await exited;
    await writeFile(path.join(resultDir, `${mode}-vite-${iteration}-${cache}.log`), output);
  }
}
async function productionSmoke(mode, directory) {
  const dist = path.join(directory, sample, 'dist');
  const destination = path.join(root, 'public/bun-evaluation');
  await mkdir(destination, { recursive: true });
  for (const name of await readdir(destination)) await rm(path.join(destination, name), { recursive: true, force: true });
  await cp(dist, destination, { recursive: true });
  const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  try {
    await page.goto(`${baseURL}/__frontend_evaluation`);
    await expect(page.getByRole('heading', { name: 'Bun比較検証' })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(240, 248, 255)');
    await page.getByRole('button').click(); await expect(page.getByRole('status')).toHaveText('カウント: 1');
    await page.reload(); await expect(page.getByRole('status')).toHaveText('カウント: 0');
    expect(errors).toEqual([]); report.modes[mode].railsManifestAndAssets = true;
  } finally { await context.close(); }
  const files = await readdir(path.join(dist, 'assets'));
  report.modes[mode].assets = [];
  for (const file of files.sort()) report.modes[mode].assets.push({ file, sha256: createHash('sha256').update(await readFile(path.join(dist, 'assets', file))).digest('hex') });
}
try {
  for (let iteration = 1; iteration <= runs; iteration++) {
    for (const mode of iteration % 2 ? modes : [...modes].reverse()) {
      if (report.modes[mode].compatible === false) continue;
      const directory = snapshots[mode];
      const env = { EVALUATION_TRACE: path.join(resultDir, `${mode}-runtime.jsonl`), CI: 'true' };
      try {
        await install(mode, directory, iteration, 'cold');
        await install(mode, directory, iteration, 'warm');
        if (iteration === 1) {
          report.modes[mode].dependencies = {};
          for (const project of projects) report.modes[mode].dependencies[project] = await dependencyGraph(path.join(directory, project));
        }
        for (const [metric, script, args] of [
          ['api_types', 'tools/api-types/generate.mjs', ['--check']],
          ['typecheck', 'node_modules/typescript/bin/tsc', ['--noEmit']],
          ['sample_typecheck', 'node_modules/typescript/bin/tsc', ['--noEmit', '-p', `${sample}/tsconfig.json`]],
        ]) record(mode, iteration, metric, await command(runtimeCommand(mode, directory, path.join(directory, script), args), { cwd: directory, env }));
        record(mode, iteration, 'build', await command(runtimeCommand(mode, directory, path.join(directory, sample, 'node_modules/vite/bin/vite.js'), ['build']), { cwd: path.join(directory, sample), env }));
        await devSmoke(mode, directory, iteration, 'cold'); await devSmoke(mode, directory, iteration, 'warm');
        await productionSmoke(mode, directory);
        if (iteration <= e2eRuns) {
          const jsonFile = path.join(resultDir, `${mode}-e2e-${iteration}.json`);
          const result = await command(runtimeCommand(mode, directory, path.join(directory, 'node_modules/@playwright/test/cli.js'), ['test', '--retries=0', '--reporter=line,json']), { cwd: directory, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonFile }, timeout: 180_000 });
          const data = JSON.parse(await readFile(jsonFile, 'utf8'));
          if (data.stats.expected !== 24 || data.stats.unexpected || data.stats.flaky || data.stats.skipped) throw new Error(`Unexpected E2E counts: ${JSON.stringify(data.stats)}`);
          record(mode, iteration, 'e2e_wall', result, { passed: data.stats.expected });
          record(mode, iteration, 'e2e_tests', { seconds: data.stats.duration / 1000 }, { passed: data.stats.expected });
        }
        report.modes[mode].compatible = true;
      } catch (error) {
        report.modes[mode].compatible = false;
        report.modes[mode].failure = { message: error.message, ...error.result };
        console.error(`CANDIDATE FAILED ${mode}: ${error.message}`);
      }
      await save();
    }
  }
  if (report.modes['npm-node']) {
    for (const mode of modes.filter(item => item !== 'npm-node')) {
      const candidate = report.modes[mode]; const baseline = report.modes['npm-node'];
      candidate.sameDependencies = JSON.stringify(candidate.dependencies) === JSON.stringify(baseline.dependencies);
      candidate.sameAssets = JSON.stringify(candidate.assets) === JSON.stringify(baseline.assets);
    }
  }
  for (const mode of modes) {
    try {
      const rows = (await readFile(path.join(resultDir, `${mode}-runtime.jsonl`), 'utf8')).trim().split('\n').map(JSON.parse);
      report.modes[mode].runtimeExecutables = [...new Map(rows.map(row => [JSON.stringify([row.execPath, row.node, row.bun]), { execPath: row.execPath, node: row.node, bun: row.bun }])).values()];
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ result: path.join(resultDir, 'results.json'), modes: Object.fromEntries(modes.map(mode => [mode, report.modes[mode].compatible])) }));
  if (report.modes['npm-node']?.compatible === false || report.modes['bun-node']?.compatible === false || report.modes['bun-node']?.sameDependencies === false || report.modes['bun-node']?.sameAssets === false) process.exitCode = 1;
} finally { await browser.close(); }
