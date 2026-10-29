// Preparación fuera del camino HTTP. Usa las mismas reglas que las vistas.
import { palabrasDe } from '../busqueda/texto.js';
import { extremoVisible, enDia, sumarDiasCalendario, programacionesCalendario, presentacionCalendario, TRAMO_MAX_DIAS } from './fechas.js';

export const ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'UTC'];
// Tramo válido en todas las zonas: citas cuyos días no dependen de un instante.
export const TODAS_LAS_ZONAS = '*';
// «Comprobado» cambia en cada pasada aunque la cita no cambie. En la lectura va
// por fuente (cobertura), así que cada pasada reescribe solo lo que cambió.
// Los tramos largos se parten por meses: ninguno pasa de TRAMO_MAX_DIAS, así
// la API lee solo los que terminan cerca de la ventana pedida.
function partirTramo([desde, hasta]) {
  if (!desde || sumarDiasCalendario(desde, TRAMO_MAX_DIAS) >= hasta) return [[desde, hasta]];
  const trozos = [];
  for (let a = desde; a < hasta;) {
    const d = new Date(a.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1);
    const b = d.toISOString().slice(0, 10) < hasta ? d.toISOString().slice(0, 10) : hasta;
    trozos.push([a, b]); a = b;
  }
  return trozos;
}
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
  // Las resoluciones de lugares y territorios citan su origen, también con «comprobado».
  const limpias = sinComprobado(datos.entidades);
  const eventos = [], facetas = [], tramos = [], entidades = Object.entries(limpias);
  let evaluaciones = 0;
  const texto = s => ' ' + palabrasDe(s).map(p => p.t).join(' ') + ' ';
  // Categoría (color de la tira y del mes): la raíz del catálogo de los temas
  // de sus objetivos. Con varias, la primera en el orden del catálogo.
  const conceptos = datos.catalogo?.conceptos || {};
  const ordenRaices = Object.keys(conceptos).filter(i => !conceptos[i].padres?.length);
  const raices = new Map();
  const raicesDe = (tema, camino = new Set()) => {
    if (!raices.has(tema)) {
      const c = conceptos[tema];
      raices.set(tema, !c || camino.has(tema) ? [] : !c.padres?.length ? [tema]
        : c.padres.flatMap(p => raicesDe(p, new Set([...camino, tema]))));
    }
    return raices.get(tema);
  };
  for (const original of datos.eventos) {
    const e = sinComprobado(original), objetivos = e.objetivos.map(k => limpias[k]);
    if (objetivos.some(o => !o)) throw new Error('Objetivo ausente');
    const detalle = { evento: e, entidades: Object.fromEntries(e.objetivos.map(k => [k, limpias[k]])) };
    const tarjeta = Object.fromEntries(['id', 'clase', 'nombres', 'programacion', 'territorios'].map(k => [k, e[k]]));
    // Ciclos y festivales: sin clave cuando no hay, para no reescribir el resto.
    if (e.etiquetas?.length) tarjeta.etiquetas = e.etiquetas;
    // Lugar compacto para la lista; dirección, coordenadas y procedencia van en el detalle.
    const lugar = e.lugar?.valor;
    tarjeta.lugar = lugar && typeof lugar === 'object'
      ? { nombre: lugar.nombre || null, municipio: lugar.municipio || lugar.municipio_literal || null }
      : lugar || null;
    tarjeta.resultado_disponible = Boolean(e.resultado);
    tarjeta.fuentes = [...new Set(e.fuentes.map(f => f.fuente))];
    // Obra que la fuente declara (celebracion_de vigente, como mucho una). Sin
    // clave cuando no hay: así no se reescriben las tarjetas sin obra.
    const obra = e.objetivos.find(k => limpias[k].tipo === 'actividad');
    if (obra) tarjeta.obra = { id: obra, nombres: limpias[obra].nombres };
    // Lo que enseña la tarjeta del calendario, también sin clave cuando no hay.
    if (e.formatos?.length) tarjeta.formatos = e.formatos;
    if (e.precio) tarjeta.precio = e.precio;
    if (e.programa?.length) tarjeta.tiene_programa = true;
    const propias = new Set(objetivos.flatMap(o => o.temas || []).flatMap(t => raicesDe(t)));
    const categoria = ordenRaices.find(r => propias.has(r));
    if (categoria) tarjeta.categoria = categoria;
    const competiciones = [...new Set(objetivos.flatMap(o => o.codigos || []))];
    if (competiciones.length) tarjeta.competiciones = competiciones;
    // Cita, programa o prolongada: una sola si coincide en las tres zonas.
    const presentaciones = Object.fromEntries(ZONAS.map(z => [z, presentacionCalendario(e, z)]));
    tarjeta.presentacion = new Set(Object.values(presentaciones)).size === 1 ? presentaciones[ZONAS[0]] : presentaciones;
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
    agregar('etiqueta', (e.etiquetas || []).map(t => t.id));
    // Filtros del calendario (clasificador.py); el público es dato, no faceta.
    agregar('formato', e.formatos || []);
    agregar('precio', e.precio ? [e.precio] : []);
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
      return propios.flatMap(partirTramo);
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
  return { version: 1, generado: datos.generado, desde, hasta, zonas: ZONAS, tramo_max_dias: TRAMO_MAX_DIAS,
    catalogo: datos.catalogo, territorios_catalogo: datos.territorios_catalogo,
    fuentes: datos.fuentes, cobertura: comprobaciones,
    colecciones: datos.cobertura_colecciones || [], eventos, facetas, tramos,
    entidades: entidades.map(([k, e]) => [k, e.tipo, texto(Object.values(e.nombres).join(' ')), JSON.stringify(e)]) };
}
