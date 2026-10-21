// workers/deno-buscar/src/tiempo/avisos.js
// Avisos de AEMET (tar de CAP) y de MeteoAlarm (Atom, de respaldo) → un
// mismo formato. Sin red ni Deno: lo prueban los tests de Node (tests/tiempo/).
//
//   { zona: '713601', area: 'Rias Baixas', fen: 'PR', nivel: 'naranja',
//     inicio, fin,                         // ISO con zona horaria
//     texto: { es, en } | null }           // el Atom no trae descripción
//
// La zona lleva comunidad, provincia (o isla) y zona: 71 36 01. El cliente
// pone los nombres y agrupa.

const NIVELES = new Set(['amarillo', 'naranja', 'rojo']);
const dec = new TextDecoder('utf-8');

const campo = (xml, tag) => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? null;
const parametro = (xml, nombre) =>
  xml.match(new RegExp(`${nombre}</valueName>\\s*<value>([^<]*)`))?.[1] ?? null;

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const texto = s => s == null ? null
  : s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTIDADES[e]).trim();

// Un CAP de AEMET: un <info> por idioma; el de castellano manda. Varias
// <area> solo en los avisos verdes de toda una comunidad.
export function desdeCap(xml) {
  if (/<msgType>Cancel</.test(xml)) return [];
  const infos = xml.split('<info>').slice(1);
  const es = infos.find(i => i.includes('<language>es-ES'));
  if (!es) return [];
  const nivel = parametro(es, 'nivel');
  if (!NIVELES.has(nivel)) return [];
  const en = infos.find(i => i.includes('<language>en-GB'));
  const base = {
    fen: (parametro(es, 'fenomeno') || '').split(';')[0],
    nivel,
    inicio: campo(es, 'onset'),
    fin: campo(es, 'expires'),
    texto: { es: texto(campo(es, 'description')), en: en ? texto(campo(en, 'description')) : null },
  };
  return es.split('<area>').slice(1).map(a => ({
    zona: parametro(a, 'zona'),
    area: texto(campo(a, 'areaDesc')),
    ...base,
  }));
}

// Los ficheros de un tar (ustar): cabecera de 512 bytes con el tamaño en
// octal y el contenido en bloques de 512. AEMET lo llama .tar.gz pero no va
// comprimido.
export function* ficherosTar(bytes) {
  for (let off = 0; off + 512 <= bytes.length;) {
    const h = bytes.subarray(off, off + 512);
    if (h[0] === 0) return;
    const tam = parseInt(dec.decode(h.subarray(124, 136)).replace(/\0.*$/s, '').trim(), 8) || 0;
    const ini = off + 512;
    yield dec.decode(bytes.subarray(ini, ini + tam));
    off = ini + Math.ceil(tam / 512) * 512;
  }
}

// Todos los avisos amarillos, naranjas y rojos del tar. Si una versión
// sustituye a otra (<references>), la sustituida se quita. El tar siempre
// trae CAP, aunque sean verdes: si no hay ninguno, la respuesta no vale
// (y no se guarda como «no hay avisos»).
export function desdeTar(bytes) {
  const caps = [...ficherosTar(bytes)].filter(xml => xml.includes('<alert'));
  if (!caps.length) throw new Error('AEMET: tar sin avisos CAP');
  const sustituidos = new Set();
  for (const xml of caps) {
    for (const ref of (campo(xml, 'references') || '').split(/\s+/)) {
      const id = ref.split(',')[1];
      if (id) sustituidos.add(id);
    }
  }
  return caps
    .filter(xml => !sustituidos.has(campo(xml, 'identifier')))
    .flatMap(desdeCap);
}

// Atom de MeteoAlarm: la severidad da el nivel, y el identificador de AEMET
// lleva la zona y el fenómeno («…ES.261021093209.659601PRP1220575129»).
// Los costeros (CO) no llevan la C de su zona: «663901COCO…» es la 663901C.
const SEVERIDAD = { Moderate: 'amarillo', Severe: 'naranja', Extreme: 'rojo' };

export function desdeAtom(xml) {
  if (!/<feed[\s>]/.test(xml)) throw new Error('MeteoAlarm: no es un Atom');
  return xml.split('<entry>').slice(1).flatMap(e => {
    const nivel = SEVERIDAD[campo(e, 'cap:severity')];
    const m = (campo(e, 'cap:identifier') || '').match(/\.(\d{6})([A-Z]{2})[A-Z0-9]*$/);
    if (!nivel || !m) return [];
    return [{
      zona: m[2] === 'CO' ? m[1] + 'C' : m[1], area: texto(campo(e, 'cap:areaDesc')), fen: m[2], nivel,
      inicio: campo(e, 'cap:onset'), fin: campo(e, 'cap:expires'), texto: null,
    }];
  });
}

// Un mismo aviso puede llegar dos veces con umbrales distintos (lluvia en
// 1 h y en 12 h): se junta en uno y el texto, sin frases repetidas.
function juntarTextos(a, b) {
  if (!a || !b) return a || b;
  const frases = new Set([a, b].flatMap(s => s.split(/(?<=\.)\s+/)));
  return [...frases].join(' ');
}

function fusionar(avisos) {
  const por = new Map();
  for (const a of avisos) {
    const k = [a.zona, a.fen, a.nivel, Date.parse(a.inicio), Date.parse(a.fin)].join('|');
    const b = por.get(k);
    if (!b) { por.set(k, a); continue; }
    if (a.texto && b.texto) {
      por.set(k, { ...b, texto: { es: juntarTextos(b.texto.es, a.texto.es), en: juntarTextos(b.texto.en, a.texto.en) } });
    }
  }
  return [...por.values()];
}

// Quita lo caducado y ordena: primero lo más grave y lo que empieza antes.
const PESO = { rojo: 3, naranja: 2, amarillo: 1 };
export function vigentes(avisos, ahora = Date.now()) {
  return fusionar(avisos)
    .filter(a => a.zona && Date.parse(a.fin) > ahora)
    .sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || Date.parse(a.inicio) - Date.parse(b.inicio)
      || a.zona.localeCompare(b.zona));
}
