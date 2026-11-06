import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// En local usa el venv; CI instala requirements.txt en el Python del job.
const raiz = new URL('../../', import.meta.url);
const venv = new URL('venv/bin/python', raiz);
const python = existsSync(venv) ? fileURLToPath(venv) : 'python3';
export const catalogoReal = async () => JSON.parse((await promisify(execFile)(python,
  [fileURLToPath(new URL('catalogo-real.py', import.meta.url))],
  { cwd: fileURLToPath(raiz), maxBuffer: 2 * 1024 * 1024 })).stdout);
