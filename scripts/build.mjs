import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const files = (await readdir(root)).filter(name => /\.(html|css|js)$/.test(name));
for (const name of [...files, 'assets', 'catalog', 'image-sources.json']) {
  await cp(path.join(root, name), path.join(output, name), { recursive: true });
}
const html = await readFile(path.join(output, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^\"]+)"/g)]
  .map(match => match[1].split('?')[0])
  .filter(ref => !/^(https?:|data:|#)/.test(ref));
for (const ref of references) {
  if (!(await stat(path.join(output, ref))).isFile()) throw new Error(`Eksik dosya: ${ref}`);
}
const index = JSON.parse(await readFile(path.join(output, 'catalog/index.json'), 'utf8'));
if (!Array.isArray(index.rows) || index.rows.length !== index.total) {
  throw new Error('Katalog indeksi geçersiz.');
}
console.log(`Sahne hazır: ${files.length} uygulama dosyası, ${index.total.toLocaleString('tr-TR')} katalog kaydı.`);
