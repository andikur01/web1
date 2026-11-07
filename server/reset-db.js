import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

for (const f of ['glm.db', 'glm.db-wal', 'glm.db-shm']) {
  const p = path.join(DATA_DIR, f);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log('dihapus:', p);
  }
}
console.log('Database direset. Jalankan "npm start" untuk membuat ulang.');
