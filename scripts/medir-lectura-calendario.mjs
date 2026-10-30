// Sin red: mide la publicación guardada sobre SQLite local (Node 24).
// No representa latencia, cuota ni memoria de un despliegue Turso/Workers.
// Uso: node scripts/medir-lectura-calendario.mjs publicacion.json
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { prepararLectura } from '../shared/calendario/proyeccion.js';
import { consultaEventos, consultaResumen, consultaChips, consultaBarras, consultaDisponibilidad, normalizarConsulta } from '../workers/comun/calendario.js';
import { palabrasDe } from '../shared/busqueda/texto.js';
import { sumarDiasCalendario } from '../shared/calendario/fechas.js';

const original = readFileSync(process.argv[2]);
const datos = JSON.parse(original);
const antes = performance.now(), preparada = prepararLectura(datos), msPreparacion = performance.now() - antes;
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../agenda/lectura.sql', import.meta.url), 'utf8'));
const insercion = performance.now();
db.exec('BEGIN');
for (const [tabla, n] of [['eventos', 5], ['facetas', 3], ['tramos', 4], ['activos', 4], ['chips', 7], ['entidades', 4]]) {
  const stmt = db.prepare(`INSERT INTO agenda_lectura_${tabla} VALUES (${Array(n).fill('?').join(',')})`);
  for (const fila of preparada[tabla]) stmt.run(...fila);
}
db.exec('COMMIT');
const msInsercion = performance.now() - insercion;
const desde = datos.generado.slice(0, 10), hasta = new Date(Date.parse(desde) + 14 * 86400000).toISOString().slice(0, 10);
const base = `/calendario/eventos?desde=${desde}&hasta=${hasta}`;
const territorio = preparada.facetas.find(f => f[1] === 'territorio')?.[2];
const palabra = palabrasDe(Object.values(datos.eventos[0]?.nombres || {}).join(' ')).find(p => p.t.length >= 3)?.t || 'teatro';
const consultas = [];
function medir(nombre, s) {
  const stmt = db.prepare(s.sql);
  const inicio = performance.now(), filas = stmt.all(...s.args), ms = performance.now() - inicio;
  consultas.push({ nombre, ms: +ms.toFixed(2), filas: filas.length,
    bytes: Buffer.byteLength(JSON.stringify(filas)),
    plan: db.prepare('EXPLAIN QUERY PLAN ' + s.sql).all(...s.args).map(f => f.detail) });
  return filas;
}
for (const [nombre, ruta, resumen] of [['agenda', base], ['texto', base + '&texto=' + encodeURIComponent(palabra)],
  ['exclusion', base + '&texto=-' + encodeURIComponent(palabra)],
  ...(territorio ? [['territorio', base + '&territorio=' + encodeURIComponent(territorio)]] : []),
  ['resumen', base.replace('/eventos?', '/resumen?'), true],
  ['semana-7', `/calendario/resumen?desde=${desde}&hasta=${sumarDiasCalendario(desde, 7)}`, true],
  ['mes-42', `/calendario/resumen?desde=${desde}&hasta=${sumarDiasCalendario(desde, 42)}&muestras=4&barras=1`, true]]) {
  const c = normalizarConsulta(new URL('https://datos.test' + ruta));
  medir(nombre, resumen ? consultaResumen(c, preparada) : consultaEventos(c, preparada));
  if (c.barras) medir(nombre + '-barras', consultaBarras(c, preparada));
}
const c = normalizarConsulta(new URL(`https://datos.test/calendario/eventos?desde=${desde}&hasta=${sumarDiasCalendario(desde, 1)}&chips=1`));
const primera = medir('chips-dia-1', consultaChips(c, preparada)), ultima = primera.slice(0, c.limite).at(-1);
medir('chips-dia-2', consultaChips(c, preparada, ultima
  ? ['', '', ultima.dia, String(ultima.orden), ultima.id, ultima.ocurrencia] : null));
medir('disponibilidad', consultaDisponibilidad(c, preparada));
// Entradas candidatas del índice; no son las filas facturadas por Turso.
const estimacion = [7, 42].map(dias => {
  const fin = sumarDiasCalendario(desde, dias), tope = sumarDiasCalendario(fin, preparada.tramo_max_dias);
  return { dias,
    tramos: db.prepare("SELECT count(*) AS n FROM agenda_lectura_tramos WHERE zona IN (?,'*') AND hasta>? AND hasta<=?")
      .get(c.zona, desde, tope).n,
    chips: db.prepare("SELECT count(*) AS n FROM agenda_lectura_chips WHERE zona IN (?,'*') AND dia>=? AND dia<?")
      .get(c.zona, desde, fin).n };
});
console.log(JSON.stringify({ entorno: 'SQLite local en memoria; sin red', eventos: datos.eventos.length,
  bytesPublicacion: original.length, tramos: preparada.tramos.length, activos: preparada.activos.length, chips: preparada.chips.length, facetas: preparada.facetas.length,
  msPreparacion: +msPreparacion.toFixed(2), msInsercion: +msInsercion.toFixed(2),
  bytesBase: db.prepare('PRAGMA page_count').get().page_count * db.prepare('PRAGMA page_size').get().page_size,
  estimacion, consultas }, null, 2));
db.close();
