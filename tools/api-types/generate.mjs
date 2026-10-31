import { createClient } from '@hey-api/openapi-ts';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = path.join(root, 'types/api-v1');
const check = process.argv.includes('--check');
const temporary = check ? await mkdtemp(path.join(tmpdir(), 'tsundoku-api-types-')) : null;

try {
  await createClient({
    input: path.join(root, 'docs/api/v1/openapi.json'),
    output: temporary || target,
    plugins: ['@hey-api/typescript'],
  });
  if (check) {
    const files = async directory => {
      const names = await readdir(directory, { recursive: true });
      const result = [];
      for (const name of names) {
        if ((await stat(path.join(directory, name))).isFile()) result.push(name);
      }
      return result.sort();
    };
    const generated = await files(temporary);
    const committed = await files(target);
    let current = JSON.stringify(generated) === JSON.stringify(committed);
    for (const name of generated) {
      if (!committed.includes(name) || (await readFile(path.join(temporary, name), 'utf8')) !== (await readFile(path.join(target, name), 'utf8'))) current = false;
    }
    if (!current) throw new Error('API types are out of date. Run npm run api:types and commit the result.');
    process.stdout.write('API types match the OpenAPI contract.\n');
  }
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
