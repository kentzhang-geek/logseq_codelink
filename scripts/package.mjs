import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release');
const output = path.join(release, 'logseq-codelink');
await mkdir(output, { recursive: true });
// Only remove this generated distribution directory, after verifying its resolved location.
const generatedDist = path.resolve(output, 'dist');
if (path.relative(root, generatedDist) !== path.join('release', 'logseq-codelink', 'dist')) {
  throw new Error('Unexpected distribution directory.');
}
await rm(generatedDist, { recursive: true, force: true });
for (const file of ['dist', 'icon.svg', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await cp(path.join(root, file), path.join(output, file), { recursive: true, force: true });
}
const licenses = path.join(output, 'licenses');
await mkdir(licenses, { recursive: true });
await cp(path.join(root, 'node_modules/@logseq/libs/dist/lsplugin.user.js.LICENSE.txt'), path.join(licenses, 'logseq-sdk-bundle.txt'));
for (const dependency of ['dompurify', 'debug', 'deepmerge', 'eventemitter3', 'fast-deep-equal', 'lodash-es', 'path', 'snake-case', 'dot-case', 'no-case', 'lower-case', 'tslib', 'util', 'inherits', 'ms']) {
  for (const file of ['LICENSE', 'license', 'LICENSE.txt', 'license.txt']) {
    try {
      await cp(path.join(root, 'node_modules', dependency, file), path.join(licenses, `${dependency}.txt`));
      break;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
const { name, version, description, main, logseq, license } = metadata;
await writeFile(path.join(output, 'package.json'), JSON.stringify({ name, version, description, main, logseq, license }, null, 2) + '\n');
console.log(`Load unpacked plugin: ${output}`);
const entries = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else entries[path.relative(release, absolute).split(path.sep).join('/')] = new Uint8Array(await readFile(absolute));
  }
}
await collect(output);
const zip = path.join(release, `logseq-codelink-v${version}.zip`);
await writeFile(zip, zipSync(entries, { level: 9 }));
console.log(`Archive: ${zip}`);
