if (process.env.EVALUATION_TRACE) {
  require('node:fs').appendFileSync(process.env.EVALUATION_TRACE, JSON.stringify({
    pid: process.pid,
    execPath: process.execPath,
    node: process.versions.node,
    bun: process.versions.bun || null,
    argv: process.argv.slice(1),
  }) + '\n');
}
