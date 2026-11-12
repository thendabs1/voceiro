import { CONSULTAS, ESPN, admiteConsultaESPN, admiteConsultaMotor } from '../shared/consultas/registro.js';
import * as normalizar from './normalizar.js';
import { normalizarPartido } from './partido.js';
import { crearTenis, leerIdTenis } from './tenis.js';
import { FUENTE_EUROLIGA, temporadaEuroliga, urlJuegosEuroliga, urlJuegoEuroliga, resultadosEuroliga, partidoEuroliga } from './euroliga.js';
import { crearMotor } from './motor.js';
import { leerIdMotor, FUENTES_MOTOR } from './motor-normalizar.js';
import { crearPresupuestoMotor } from './presupuesto-motor.js';

const DIA = 86400;
const IDIOMAS = new Set(['es', 'gl', 'ca', 'eu', 'en']);
const UA = 'Voceiro/1.0 (+https://thendabs1.github.io/voceiro/; consultas puntuales)';
const OL = 'https://openlibrary.org';
const TMDB = 'https://api.themoviedb.org/3';
const fallo = (mensaje, status = 503) => Object.assign(new Error(mensaje), { status });

// Presupuestos por instancia, como el límite por IP. No son cuotas globales
// entre réplicas. Open Library se serializa para espaciar también las fichas.
export function crearPresupuesto({ ahora = Date.now, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const motor = crearPresupuestoMotor({ ahora, dormir });
  let cola = Promise.resolve(), pendientes = 0, ultima = -Infinity, dia = '', cuenta = 0;
  return async (proveedor, tarea, maxDiario = 1000) => {
    if (proveedor === 'espn') {
      const hoy = new Date(ahora()).toISOString().slice(0, 10);
      if (hoy !== dia) { dia = hoy; cuenta = 0; }
      if (cuenta >= maxDiario) throw fallo('Presupuesto diario de ESPN agotado');
      cuenta++;
    }
    if (proveedor !== 'openlibrary') return motor(proveedor, tarea);
    if (pendientes >= 6) throw fallo('Presupuesto de Open Library ocupado');
    pendientes++;
    const trabajo = cola.then(async () => {
      const espera = ultima + 1000 - ahora();
      if (espera > 0) await dormir(espera);
      ultima = ahora();
      return tarea();
    });
    cola = trabajo.catch(() => {});
    try { return await trabajo; } finally { pendientes--; }
  };
}

const FUENTES = {
  libro: ['Open Library', OL, 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  autor: ['Open Library', OL, 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  pelicula: ['TMDB', 'https://www.themoviedb.org', 'Condiciones de TMDB', 'https://www.themoviedb.org/terms-of-use'],
  serie: ['TMDB', 'https://www.themoviedb.org', 'Condiciones de TMDB', 'https://www.themoviedb.org/terms-of-use'],
  clasificacion: ['ESPN', 'https://www.espn.com', 'Condiciones de ESPN', 'https://disneytermsofuse.com/'],
  resultados: ['ESPN', 'https://www.espn.com', 'Condiciones de ESPN', 'https://disneytermsofuse.com/'],
  partido: ['ESPN', 'https://www.espn.com', 'Condiciones de ESPN', 'https://disneytermsofuse.com/'],
  contexto: ['Wikipedia + Wikidata', 'https://www.wikipedia.org', 'CC BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/'],
};

// Dependencias inyectables: los tests no acceden a red ni esperan al reloj real.
export function crearConsultas({ fetch: descargar = (...args) => fetch(...args), ahora = Date.now,
  abrirCache = () => caches.open('voceiro-consultas-v1'),
  entorno = nombre => globalThis.Deno?.env.get(nombre), presupuesto = crearPresupuesto({ ahora }) } = {}) {
  const enCurso = new Map();
  const motor = crearMotor({ pedir, ahora, abrirCache });
  // Lo programado caduca en su saque, no una hora después: así el panel ofrece
  // Actualizar en cuanto puede haber marcador. Un saque que se retrasa se vigila
  // cada minuto durante una hora.
  const hastaSaque = (partidos, tope) => Math.min(tope, ...partidos.filter(p => p.estado === 'programado')
    .map(p => Date.parse(p.inicio)).filter(i => i > ahora() - 3600e3)
    .map(i => Math.max(60, Math.ceil((i - ahora()) / 1000))));
  async function pedir(proveedor, url) {
    const headers = { 'User-Agent': UA, Accept: 'application/json' };
    if (proveedor === 'tmdb') {
      const token = entorno('TMDB_API_READ_ACCESS_TOKEN');
      if (!token) throw fallo('TMDB sin credencial');
      headers.Authorization = `Bearer ${token}`;
    }
    const configurado = Number(entorno('ESPN_MAX_PETICIONES_DIA') ?? 1000);
    const max = Number.isInteger(configurado) && configurado >= 0 ? configurado : 1000;
    return presupuesto(proveedor, async () => {
      const r = await descargar(url, { headers, signal: AbortSignal.timeout(proveedor === 'euroliga' ? 15000 : 8000) });
      if (r.status === 404 && proveedor === 'openf1' && new URL(url).pathname === '/v1/session_result') return [];
      if (!r.ok) throw fallo(`${proveedor}: respuesta ${r.status}`);
      const d = await r.json();
      if (!d || typeof d !== 'object' || d.error || d.errors || d.success === false) throw fallo(`${proveedor}: respuesta no válida`);
      return d;
    }, max);
  }

  function url(base, params) {
    const u = new URL(base);
    u.search = new URLSearchParams(params);
    return u.href;
  }

  const tenis = crearTenis({ pedir, abrirCache, ahora });

  async function producir(tipo, texto, id, idioma, fecha) {
    if (leerIdMotor(id) || (!id && admiteConsultaMotor(tipo, texto))) return motor(texto, id, fecha);
    if (['resultados', 'partido'].includes(tipo) && ['atp', 'wta'].includes(texto)) return tenis({ tipo, id, circuito: texto, fecha });
    const wp = `https://${idioma}.wikipedia.org`;
    if (!id) {
      if (tipo === 'resultados' && texto === 'euroliga') {
        return { candidatos: [{ id: 'euroliga:resultados', titulo: 'EuroLeague', detalle: tipo,
          anio: null, imagen: null, enlace: FUENTE_EUROLIGA.url }] };
      }
      if (tipo === 'partido') {
        const circuito = ESPN[texto].join('/');
        const d = await pedir('espn', `https://site.api.espn.com/apis/site/v2/sports/${circuito}/scoreboard`);
        if (!Array.isArray(d.events)) throw fallo('ESPN: marcador no válido');
        const partidos = normalizar.resultados(d, texto).partidos;
        return { candidatos: partidos.filter(p => p.id).map(p => ({ id: p.id,
          titulo: `${p.local || 'Por determinar'} · ${p.visitante || 'Por determinar'}`, detalle: p.marcador ? `${p.marcador.local ?? '—'}–${p.marcador.visitante ?? '—'}` : null,
          inicio: p.inicio, estado: p.estado, anio: null, imagen: null, enlace: FUENTES.partido[1] })),
          ttl: partidos.some(p => p.estado === 'en_juego') ? 60 : 900 };
      }
      if (tipo === 'clasificacion' || tipo === 'resultados') {
        return { candidatos: [{ id: `espn:${tipo}/${texto}`, titulo: texto, detalle: tipo,
          anio: null, imagen: null, enlace: FUENTES[tipo][1] }] };
      }
      if (tipo === 'libro' || tipo === 'autor') {
        const ruta = tipo === 'libro' ? '/search.json' : '/search/authors.json';
        const d = await pedir('openlibrary', url(OL + ruta, { q: texto, limit: '20',
          ...(tipo === 'libro' ? { fields: 'key,title,author_key,author_name,first_publish_year,edition_count,language,cover_i' } : {}) }));
        return { candidatos: normalizar[tipo === 'libro' ? 'libros' : 'autores'](d) };
      }
      if (tipo === 'pelicula' || tipo === 'serie') {
        const ruta = tipo === 'pelicula' ? 'movie' : 'tv';
        const d = await pedir('tmdb', url(`${TMDB}/search/${ruta}`, { query: texto, language: idioma, include_adult: 'false' }));
        return { candidatos: normalizar.audiovisuales(d, tipo) };
      }
      return { candidatos: normalizar.paginas(await pedir('wikipedia', url(`${wp}/w/rest.php/v1/search/page`, { q: texto, limit: '10' })), idioma) };
    }
    const valor = id.slice(id.indexOf(':') + 1);
    if (id === 'euroliga:resultados') {
      const dia = fecha || new Date(ahora()).toISOString().slice(0, 10);
      const temporada = temporadaEuroliga(dia);
      const ficha = resultadosEuroliga(await pedir('euroliga', urlJuegosEuroliga(temporada)), dia, temporada, ahora());
      return { ficha, ttl: 900, vacio: !ficha.partidos.length };
    }
    if (id.startsWith('euroliga:partido/')) {
      const [temporada, codigo] = id.slice('euroliga:partido/'.length).split('/');
      const ficha = partidoEuroliga(await pedir('euroliga', urlJuegoEuroliga(temporada, codigo)), temporada, codigo, ahora());
      return { ficha, ttl: ficha.estado === 'final' ? 3600 : 900 };
    }
    if (tipo === 'partido') {
      const [, codigo, evento] = valor.split('/');
      const [deporte, liga] = ESPN[codigo];
      const d = await pedir('espn', `https://site.api.espn.com/apis/site/v2/sports/${deporte}/${liga}/summary?event=${evento}`);
      const ficha = normalizarPartido(d, codigo, deporte, liga, evento);
      const seccion = deporte === 'soccer' ? 'soccer/match' : `${codigo}/game`;
      return { ficha, enlace: `https://www.espn.com/${seccion}/_/gameId/${evento}`,
        ttl: ficha.estado === 'en_juego' ? 60 : ficha.estado === 'final' ? 3600 : hastaSaque([ficha], 900) };
    }
    if (tipo === 'libro') {
      const obra = await pedir('openlibrary', `${OL}/works/${valor}.json`);
      if (!obra.title) throw fallo('Open Library: obra no válida');
      const meta = await pedir('openlibrary', url(`${OL}/search.json`, { q: `key:/works/${valor}`,
        fields: 'key,title,author_key,author_name,first_publish_year,edition_count,language,cover_i', limit: '1' }));
      const exacta = meta.docs.find(d => d.key === `/works/${valor}`);
      const ficha = normalizar.libro(obra, exacta);
      if (!ficha.autores.length) ficha.autores = (obra.authors || []).map(a => ({ id: `openlibrary:${a.author.key.split('/').pop()}`, nombre: null }));
      return { ficha, incompleto: !exacta };
    }
    if (tipo === 'autor') {
      const datos = await pedir('openlibrary', `${OL}/authors/${valor}.json`);
      if (!datos.name) throw fallo('Open Library: autor no válido');
      const obras = await pedir('openlibrary', `${OL}/authors/${valor}/works.json?limit=10`);
      return { ficha: normalizar.autor(datos, obras) };
    }
    if (tipo === 'pelicula' || tipo === 'serie') {
      const d = await pedir('tmdb', url(`${TMDB}/${valor}`, { language: idioma,
        append_to_response: `${tipo === 'serie' ? 'aggregate_credits' : 'credits'},watch/providers` }));
      if (!d.id || !(d.title || d.name)) throw fallo('TMDB: ficha no válida');
      return { ficha: normalizar.audiovisual(d, tipo), incompleto: !d['watch/providers'] };
    }
    if (tipo === 'clasificacion' || tipo === 'resultados') {
      const codigo = valor.split('/')[1];
      const circuito = ESPN[codigo].join('/');
      const recurso = `https://site.api.espn.com/apis/site/v2/sports/${circuito}/scoreboard`;
      const scoreboard = await pedir('espn', fecha ? url(recurso, { dates: fecha.replaceAll('-', '') }) : recurso);
      if (!Array.isArray(scoreboard.events)) throw fallo('ESPN: marcador no válido');
      if (fecha && scoreboard.day?.date && scoreboard.day.date !== fecha) throw fallo('ESPN: fecha distinta de la solicitada');
      const partidos = normalizar.resultados(scoreboard, codigo, fecha);
      const enJuego = partidos.partidos.some(p => p.estado === 'en_juego') || (scoreboard.events || []).some(e => e.status?.type?.state === 'in');
      if (tipo === 'resultados') return { ficha: partidos, ttl: enJuego ? 60 : hastaSaque(partidos.partidos, 3600), vacio: !partidos.partidos.length };
      const d = await pedir('espn', `https://site.api.espn.com/apis/v2/sports/${circuito}/standings`);
      if (!Array.isArray(d.children) && !d.standings) throw fallo('ESPN: clasificación no válida');
      const ficha = normalizar.clasificacion(d, codigo, ESPN[codigo][0]);
      return { ficha, ttl: enJuego ? 60 : 900, vacio: !ficha.grupos.length };
    }
    const resumen = await pedir('wikipedia', `${wp}/api/rest_v1/page/summary/${encodeURIComponent(valor)}`);
    if (!resumen.title || typeof resumen.extract !== 'string') throw fallo('Wikipedia: resumen no válido');
    let entidad;
    if (resumen.wikibase_item) {
      const d = await pedir('wikidata', url('https://www.wikidata.org/w/api.php', {
        action: 'wbgetentities', ids: resumen.wikibase_item, props: 'claims', format: 'json',
      }));
      entidad = d.entities?.[resumen.wikibase_item];
      if (!entidad || entidad.missing !== undefined) throw fallo('Wikidata: entidad no disponible');
    }
    return { ficha: normalizar.contexto(resumen, entidad), incompleto: !entidad || resumen.type === 'disambiguation' };
  }

  return async function handleConsulta(url, cabeceras = {}) {
    let tipo = url.searchParams.get('tipo') || null;
    const id = url.searchParams.get('id');
    const idioma = url.searchParams.get('idioma') || 'es';
    const fecha = url.searchParams.get('fecha');
    let texto = (url.searchParams.get('texto') || '').trim().replace(/\s+/g, ' ');
    const responder = (datos, status, ttl = 0) => new Response(JSON.stringify(datos), { status, headers: {
      ...cabeceras, 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': ttl > 0 ? `public, max-age=${ttl}` : 'no-store',
    } });
    try {
      if (!IDIOMAS.has(idioma)) throw fallo('Idioma no admitido', 400);
      if (url.pathname === '/consulta/ficha') {
        const motor = leerIdMotor(id);
        if (motor) { tipo = motor.lista ? 'resultados' : 'partido'; texto = motor.competicion; }
        else if (/^openlibrary:OL\d+[WA]$/.test(id || '')) tipo = id.endsWith('W') ? 'libro' : 'autor';
        else if (/^tmdb:(movie|tv)\/[1-9]\d*$/.test(id || '')) tipo = id.startsWith('tmdb:movie/') ? 'pelicula' : 'serie';
        else if (id === 'euroliga:resultados') { tipo = 'resultados'; texto = 'euroliga'; }
        else if (/^euroliga:partido\/E\d{4}\/[1-9]\d{0,3}$/.test(id || '')) { tipo = 'partido'; texto = 'euroliga'; }
        else if (/^espn:(clasificacion|resultados)\/[a-z0-9-]+$/.test(id || '')) {
          const partes = id.slice(5).split('/'); tipo = partes[0]; texto = partes[1];
        } else if (/^espn:partido\/[a-z0-9-]+\/[1-9]\d{0,11}$/.test(id || '')) {
          tipo = 'partido'; texto = id.split('/')[1];
        } else if (leerIdTenis(id)) { tipo = 'partido'; texto = leerIdTenis(id).circuito;
        } else if (/^wikipedia:[^\x00-\x1f]{1,250}$/.test(id || '')) tipo = 'contexto';
        else throw fallo('Identificador no válido', 400);
      } else if (id || !texto || texto.length > 250 || !Object.hasOwn(CONSULTAS, tipo)) throw fallo('Tipo o texto no válido', 400);
      // Con ID manda el ID: `texto` no debe cambiar proveedor ni atribución.
      const euroliga = id ? id.startsWith('euroliga:') : texto === 'euroliga';
      if ((tipo === 'clasificacion' || tipo === 'resultados' || tipo === 'partido') && !leerIdMotor(id) && !(!id && admiteConsultaMotor(tipo, texto))) {
        if (euroliga) {
          if (tipo !== 'resultados' && tipo !== 'partido') throw fallo('Consulta no disponible para esta competición', 400);
        } else {
          if (!Object.hasOwn(ESPN, texto)) throw fallo('Competición sin equivalencia ESPN', 400);
          if (!admiteConsultaESPN(tipo, texto)) throw fallo('Consulta no disponible para esta competición', 400);
          if (tipo === 'partido' && ['atp', 'wta'].includes(texto) && id && !leerIdTenis(id)) throw fallo('Identificador de tenis no válido', 400);
        }
      }
      if (fecha !== null && (tipo !== 'resultados' || url.pathname !== '/consulta/ficha'
          || !normalizar.fechaResultadosValida(fecha))) throw fallo('Fecha de resultados no válida', 400);
      const propia = euroliga ? FUENTE_EUROLIGA
        : FUENTES_MOTOR[leerIdMotor(id)?.proveedor || (!id && admiteConsultaMotor(tipo, texto) ? texto === 'f1' ? 'openf1' : 'motogp' : '')];
      const [fuente, enlace, nombre, licenciaUrl] = propia
        ? [propia.nombre, propia.url, propia.licencia, propia.licencia_url] : FUENTES[tipo];
      const base = { tipo, estado: 'ok', candidatos: [], ficha: null, fuente, enlace,
        licencia: nombre ? { nombre, enlace: licenciaUrl } : null, atribucion: propia ? propia.nombre : tipo === 'contexto' ? 'Wikipedia (autores en el historial) y Wikidata (CC0)'
          : tipo === 'pelicula' || tipo === 'serie' ? 'TMDB; JustWatch' : fuente,
        consultado: new Date(ahora()).toISOString(), caduca: null, incompleto: false };
      const clave = new URL('/consulta/cache', url);
      clave.search = new URLSearchParams({ v: '3', idioma, ...(id ? { id } : { tipo, texto }), ...(fecha ? { fecha } : {}) });
      const req = new Request(clave);
      const cache = await abrirCache();
      const hit = await cache.match(req);
      if (hit) {
        const datos = await hit.json();
        const restante = Math.floor((Date.parse(datos.caduca) - ahora()) / 1000);
        if (restante > 0) {
          const r = responder(datos, 200, restante); r.headers.set('X-Cache', 'HIT'); return r;
        }
      }
      if (enCurso.has(req.url)) return (await enCurso.get(req.url)).clone();
      const produccion = (async () => {
        try {
          const { ttl = tipo === 'pelicula' || tipo === 'serie' ? DIA : tipo === 'clasificacion' || tipo === 'resultados' || tipo === 'partido' ? 900 : 7 * DIA,
            vacio = false, ...datos } = await producir(tipo, texto, id, idioma, fecha);
          const cuerpo = { ...base, ...datos, caduca: new Date(ahora() + ttl * 1000).toISOString() };
          if (cuerpo.ficha?.fuente) {
            const f = cuerpo.ficha.fuente;
            Object.assign(cuerpo, { fuente: f.nombre, enlace: f.url, atribucion: f.nombre,
              licencia: f.licencia ? { nombre: f.licencia, enlace: f.licencia_url } : null });
          }
          if (vacio || (!cuerpo.ficha && !cuerpo.candidatos.length)) cuerpo.estado = 'vacio';
          const r = responder(cuerpo, 200, ttl);
          await cache.put(req, r.clone()).catch(() => {});
          return r;
        } catch (e) {
          return responder({ ...base, estado: 'no_disponible', incompleto: true, motivo: String(e.message).slice(0, 160) }, 200);
        }
      })();
      enCurso.set(req.url, produccion);
      try { return (await produccion).clone(); }
      finally { enCurso.delete(req.url); }
    } catch (e) {
      return responder({ tipo, estado: e.status === 400 ? 'vacio' : 'no_disponible', candidatos: [], ficha: null,
        fuente: FUENTES[tipo]?.[0] || null, enlace: FUENTES[tipo]?.[1] || null, licencia: null, atribucion: null,
        consultado: new Date(ahora()).toISOString(), caduca: null, incompleto: true, motivo: String(e.message).slice(0, 160) }, e.status === 400 ? 400 : 200);
    }
  };
}

export const handleConsulta = crearConsultas();
