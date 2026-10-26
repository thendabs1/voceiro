// Preparación fuera del camino HTTP. Usa las mismas reglas que las vistas.
import { palabrasDe } from '../busqueda/texto.js';
import { extremoVisible, enDia, sumarDiasCalendario, programacionesCalendario } from './fechas.js';

export const ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'UTC'];
// Tramo válido en todas las zonas: citas cuyos días no dependen de un instante.
export const TODAS_LAS_ZONAS = '*';
// «Comprobado» cambia en cada pasada aunque la cita no cambie. En la lectura va
// por fuente (cobertura), así que cada pasada reescribe solo lo que cambió.
const sinComprobado = v => Array.isArray(v) ? v.map(sinComprobado) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'comprobado').map(([k, x]) => [k, sinComprobado(x)])) : v;
export function prepararLectura(datos) {
  if (datos.version !== 1 || datos.nucleo_version !== 2 || datos.revision !== false
      || !Number.isFinite(Date.parse(datos.generado))) throw new Error('Se requiere una publicación pública v1');
  const hoy = new Date(datos.generado).toISOString().slice(0, 10);
  const desde = sumarDiasCalendario(hoy, -45), hasta = sumarDiasCalendario(hoy, 367);
  // Los tramos se recortan por meses enteros: con el límite diario, las
  // actividades largas cambiarían en cada publicación sin cambiar nada.
  const mes = (dia, n) => { const d = new Date(dia.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const desdeTramos = mes(desde, 0), hastaTramos = mes(hasta, 1);
  const eventos = [], facetas = [], tramos = [], entidades = Object.entries(datos.entidades);
  let evaluaciones = 0;
  const texto = s => ' ' + palabrasDe(s).map(p => p.t).join(' ') + ' ';
  for (const original of datos.eventos) {
    const e = sinComprobado(original), objetivos = e.objetivos.map(k => datos.entidades[k]);
    if (objetivos.some(o => !o)) throw new Error('Objetivo ausente');
    const detalle = { evento: e, entidades: Object.fromEntries(e.objetivos.map(k => [k, datos.entidades[k]])) };
    const tarjeta = Object.fromEntries(['id', 'clase', 'nombres', 'programacion', 'territorios'].map(k => [k, e[k]]));
    tarjeta.resultado_disponible = Boolean(e.resultado);
    tarjeta.fuentes = [...new Set(e.fuentes.map(f => f.fuente))];
    eventos.push([e.id, texto(objetivos.flatMap(o => Object.values(o.nombres)).join(' ')),
      Number(Boolean(e.resultado)), JSON.stringify(tarjeta), JSON.stringify(detalle)]);
    const f = new Map();
    const agregar = (tipo, valores) => { for (const v of valores) f.set(JSON.stringify([tipo, v]), [e.id, tipo, v]); };
    agregar('objetivo', e.objetivos);
    agregar('tema', objetivos.flatMap(o => o.temas));
    agregar('circuito', objetivos.flatMap(o => o.codigos));
    agregar('fuente', tarjeta.fuentes);
    agregar('territorio', (e.territorios || []).filter(t => t.papel === 'celebracion')
      .flatMap(t => [t.territorio, ...t.ancestros]));
    facetas.push(...f.values());
    const cuando = e.programacion?.valor?.cuando;
    const porZona = ZONAS.map(zona => {
      const propios = [];
      // Una fecha pendiente tiene su propia lista, fuera de la ventana de días.
      if (!extremoVisible(cuando?.inicio, zona).fecha) propios.push(['', '']);
      const dias = new Set();
      for (const horario of programacionesCalendario(e)) {
        const a = extremoVisible(horario.inicio, zona), b = extremoVisible(horario.fin, zona);
        if (!a.fecha) continue;
        const inicio = a.fecha > desdeTramos ? a.fecha : desdeTramos;
        const fin = (b.fecha || a.fecha) < hastaTramos ? (b.fecha || a.fecha) : sumarDiasCalendario(hastaTramos, -1);
        for (let dia = inicio; dia <= fin; dia = sumarDiasCalendario(dia, 1)) {
          if (++evaluaciones > 5_000_000) throw new Error('Lectura demasiado grande: revisar horizonte antes de publicar');
          if (enDia(horario, dia, zona)) dias.add(dia);
        }
      }
      // Unión sin solapes: cada GP se cuenta una sola vez por día, aunque
      // coincidan el principal y varias sesiones. Los huecos se conservan.
      let tramo = null;
      for (const dia of [...dias].sort()) {
        if (!tramo || tramo[1] !== dia) { tramo = [dia, '']; propios.push(tramo); }
        tramo[1] = sumarDiasCalendario(dia, 1);
      }
      return propios;
    });
    // Las citas con solo fecha (casi todas las culturales) dan los mismos
    // tramos en todas las zonas: una fila en vez de tres.
    const iguales = porZona.every(t => JSON.stringify(t) === JSON.stringify(porZona[0]));
    (iguales ? [TODAS_LAS_ZONAS] : ZONAS).forEach((zona, i) =>
      tramos.push(...porZona[i].map(([d, h]) => [zona, d, h, e.id])));
  }
  const observadas = datos.eventos.flatMap(e => e.fuentes);
  const comprobaciones = Object.keys(datos.fuentes).map(fuente => ({ fuente,
    comprobado: observadas.filter(f => f.fuente === fuente).map(f => f.comprobado)
      .sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || null,
    alcance: 'eventos_publicados', completa: false }));
  return { version: 1, generado: datos.generado, desde, hasta, zonas: ZONAS,
    catalogo: datos.catalogo, territorios_catalogo: datos.territorios_catalogo,
    fuentes: datos.fuentes, cobertura: comprobaciones,
    colecciones: datos.cobertura_colecciones || [], eventos, facetas, tramos,
    entidades: entidades.map(([k, e]) => [k, e.tipo, texto(Object.values(e.nombres).join(' ')), JSON.stringify(e)]) };
}
