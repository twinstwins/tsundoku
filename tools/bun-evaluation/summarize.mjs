import { readFile } from 'node:fs/promises';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Pass one or more completed results.json files');
const summaries = [];
for (const file of files) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (!data.completedAt) throw new Error(`Incomplete result: ${file}`);
  const metrics = {};
  for (const row of data.measurements) {
    if (!Number.isFinite(row.seconds) || row.seconds < 0) throw new Error('Invalid duration');
    ((metrics[row.metric] ||= {})[row.mode] ||= []).push(row.seconds);
  }
  const statistics = {};
  for (const [metric, modes] of Object.entries(metrics)) {
    statistics[metric] = {};
    for (const [mode, samples] of Object.entries(modes)) {
      const sorted = [...samples].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      statistics[metric][mode] = { count: samples.length, median, min: sorted[0], max: sorted.at(-1), samples };
    }
  }
  const modes = {};
  for (const [mode, row] of Object.entries(data.modes)) {
    modes[mode] = {
      compatible: row.compatible,
      hmrAndReactRefresh: row.hmrAndReactRefresh || false,
      railsManifestAndAssets: row.railsManifestAndAssets || false,
      sameDependencies: row.sameDependencies ?? null,
      sameAssets: row.sameAssets ?? null,
      dependencyCounts: Object.fromEntries(Object.entries(row.dependencies || {}).map(([name, versions]) => [name, versions.length])),
      assets: row.assets,
      runtimes: (row.runtimeExecutables || []).map(item => ({
        executable: path.basename(item.execPath), runtime: item.bun ? 'bun' : 'node',
        version: item.bun || item.node, nodeCompatibilityVersion: item.node,
      })),
      e2e: { successfulRuns: data.measurements.filter(item => item.mode === mode && item.metric === 'e2e_wall').length,
        passedCases: data.measurements.filter(item => item.mode === mode && item.metric === 'e2e_wall').reduce((sum, item) => sum + item.passed, 0) },
    };
    if (row.failure) {
      modes[mode].failure = {
        message: row.failure.message.split('\n').slice(1).join('\n').replaceAll(/[^\s"']*\/tmp\/bun-evaluation\//g, '<evaluation>/'),
        exitStatus: row.failure.status, log: row.failure.log,
      };
    }
  }
  summaries.push({ sourceRevision: data.sourceRevision, startedAt: data.startedAt, completedAt: data.completedAt,
    environment: data.environment, requestedRuns: data.runs, requestedE2eRuns: data.e2eRuns, modes, statistics });
}
process.stdout.write(JSON.stringify({ schemaVersion: 1, results: summaries }, null, 2) + '\n');
