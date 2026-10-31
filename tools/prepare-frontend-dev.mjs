import { cp, mkdir, rm } from 'node:fs/promises';
const target = new URL('../tmp/frontend-dev-test/', import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(new URL('../frontend/', import.meta.url), target, { recursive: true, filter: file => !file.split('/').some(part => ['node_modules', '.vitest'].includes(part)) });
