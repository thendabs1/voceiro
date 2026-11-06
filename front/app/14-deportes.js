/* ═══════════════════════════════════════════════════════════════
   DEPORTES: UNA SOLA LISTA PARA TODAS LAS ENTRADAS
   Competiciones por deporte y lo que ofrece cada una. De aquí salen la
   vista general (resultados: sin competición), el ▾, las pestañas de una
   competición y las sugerencias. Cada enlace escribe su orden en la barra.
   ═══════════════════════════════════════════════════════════════ */
// El orden de los bloques equilibra las tres columnas de la vista general.
const DEPORTES_ORDEN = ['futbol', 'tenis', 'baloncesto', 'motor', 'atletismo'];
// [orden, texto, columna de la matriz]; lo que no existe deja su hueco.
const DEPORTES_ACCIONES = [['resultados', 'conResultados', 2], ['calendario', 'calTitulo', 3], ['clasificacion', 'conClasificacion', 4]];
const DEPORTES_DISP = { circuitos: null, cargando: false };

// Competiciones con algo publicado: una petición al abrir la primera entrada;
// si falla se ofrecen todas y se reintenta en la siguiente.
const accesoHay = c => !DEPORTES_DISP.circuitos || DEPORTES_DISP.circuitos[c] > 0;
async function pedirDisponibilidadDeportes(){
  const d = DEPORTES_DISP;
  if (d.circuitos || d.cargando) return;
  d.cargando = true;
  try { d.circuitos = (await calPedir('catalogo', { disponibilidad: 1 }, new AbortController().signal)).disponibilidad?.circuitos || {}; }
  catch { d.circuitos = null; }
  d.cargando = false;
  conservandoFoco(() => {
    if (ACCESOS.abierto) pintarAccesos();
    if (PUNTUAL.activa && esDeporteConsulta(PUNTUAL.activa.tipo)) pintarConsulta({ conservarPlegado: true });
  });
}
// Los datos llegan mientras se navega con el teclado: repintar no debe perder el botón.
function conservandoFoco(pintar){
  const orden = document.activeElement?.dataset?.orden;
  pintar();
  if (orden) document.querySelector(`[data-orden="${orden}"]`)?.focus({ preventScroll: true });
}

// Euroliga tiene resultados y no calendario: por eso no es una capa de CAL_DEPORTES.
function competicionesDeporte(k){
  const cs = CAL_DEPORTES[k] || [];
  if (k !== 'baloncesto') return cs;
  const i = cs.indexOf('wnba') + 1;
  return [...cs.slice(0, i), 'euroliga', ...cs.slice(i)];
}
const nombreCompeticionCorto = c => c === 'euroliga' ? t('conEuroliga') : CONSULTA_DEPORTES[c] || calNombreCompeticion(c);

// Solo lo que existe: capacidades de shared/consultas/registro.js y citas publicadas.
function accionesCompeticion(c, { noticias = false } = {}){
  const hay = { resultados: codigoDeporte('resultados', c), clasificacion: codigoDeporte('clasificacion', c),
    calendario: Object.hasOwn(AMBITOS, c) && accesoHay(c) };
  const acciones = DEPORTES_ACCIONES.filter(([tipo]) => hay[tipo])
    .map(([tipo, texto, columna]) => ({ tipo, texto: t(texto), columna, orden: `${tipo}:${c}` }));
  return noticias && AMBITOS[c]?.noticias ? [...acciones, { tipo: 'noticias', texto: t('conNoticias'), orden: `${c}:noticias` }] : acciones;
}

// Una fila de la matriz, también en el ▾.
function filaCompeticion(c, resaltada = ''){
  const acciones = accionesCompeticion(c), nombre = nombreCompeticionCorto(c);
  if (!acciones.length) return '';
  return `<div class="dep-fila" data-desde="${acciones[0].columna}"><span class="dep-nombre">${escapeHtml(nombre)}</span>${acciones.map(a =>
    `<button type="button" class="dep-accion dep-col-${a.columna}" data-accion="orden" data-orden="${escapeHtml(a.orden)}"${a.tipo === resaltada ? ' data-resaltada="1"' : ''} aria-label="${escapeHtml(`${nombre}: ${a.texto}`)}">${escapeHtml(a.texto)}</button>`).join('')}</div>`;
}

// Vista general: en pantalla ancha, todo a la vista; en móvil, plegada salvo lo
// que sigo o, sin nada seguido, el primer bloque.
function htmlVistaDeportes(tipo){
  const sigo = calPreferencias()?.competiciones || [];
  const estrecha = globalThis.matchMedia?.('(max-width: 600px)').matches;
  const bloques = DEPORTES_ORDEN.map(k => ({ k, cs: competicionesDeporte(k), filas: competicionesDeporte(k).map(c => filaCompeticion(c, tipo)).join('') }))
    .filter(b => b.filas);
  return `<div class="dep-vista">${bloques.map((b, i) => {
    const abierto = !estrecha || b.cs.some(c => sigo.includes(c)) || (!sigo.length && i === 0);
    return `<details class="dep-bloque"${abierto ? ' open' : ''}><summary>${escapeHtml(t(CAL_NOMBRES_DEPORTE[b.k]))}</summary>${b.filas}</details>`;
  }).join('')}</div>`;
}

// Competición que enseña el panel, si es una ficha de resultados o clasificación.
function competicionConsulta(){
  const { activa: c, estado, origen } = PUNTUAL;
  if (!c || !['resultados', 'clasificacion'].includes(c.tipo) || estado === 'ayuda' || origen) return '';
  const codigo = normalize(c.texto);
  return codigoDeporte(c.tipo, codigo) ? codigo : '';
}
function htmlCabeceraCompeticion(codigo, tipo){
  const boton = (orden, texto, actual, valorActual) => `<button type="button" data-accion="orden" data-orden="${escapeHtml(orden)}"${actual ? ` aria-current="${valorActual}"` : ''}>${escapeHtml(texto)}</button>`;
  const deporte = DEPORTES_ORDEN.find(k => competicionesDeporte(k).includes(codigo));
  const hermanas = competicionesDeporte(deporte).filter(c => codigoDeporte(tipo, c));
  return `<nav class="dep-cab" aria-label="${escapeHtml(t('conSecciones'))}">${boton('resultados:', '‹ ' + t('calDeportesTitulo'))}
    <div class="dep-tabs">${accionesCompeticion(codigo, { noticias: true }).map(a => boton(a.orden, a.texto, a.tipo === tipo, 'page')).join('')}</div>
    ${hermanas.length > 1 ? `<div class="dep-hermanas ui-tira" role="group" aria-label="${escapeHtml(t('conOtrasCompeticiones'))}">${hermanas.map(c =>
      boton(`${tipo}:${c}`, nombreCompeticionCorto(c), c === codigo, 'true')).join('')}</div>` : ''}</nav>`;
}

// Desde el calendario: Deportes abierto con su botón no se cierra al escribir la orden.
function irDesdeCalendario(orden){
  cerrarCalendario(false);
  window.scrollTo({ top: 0, behavior: 'auto' });
  escribirAcceso(orden);
}
// Tarjeta: resultados de su competición en ese día. Si esa consulta ya estaba
// abierta, la barra no cambia y nadie recoge la fecha; puede estar en un partido.
function abrirResultadosDelDia(codigo, fecha, id){
  PUNTUAL.fechaPedida = fecha;
  irDesdeCalendario('resultados:' + codigo);
  if (!PUNTUAL.fechaPedida) return;
  Object.assign(PUNTUAL, { fechaPedida: '', origen: null });
  abrirFichaConsulta(id, { fecha });
}

// Prefijos de consulta y competiciones por su nombre, para el autocompletado.
function sugerenciasDeportes(q){
  if (q.length < 3) return [];
  const tipos = new Set();
  const prefijos = Object.entries(PREFIJOS_CONSULTAS).filter(([a, tipo]) => normalize(a).startsWith(q) && !tipos.has(tipo) && tipos.add(tipo))
    .map(([a, tipo]) => ({ kind: 'orden', value: a + ':', label: a + ':', tipo: nombreConsulta(tipo) }));
  const competiciones = DEPORTES_ORDEN.flatMap(competicionesDeporte)
    .filter(c => c.startsWith(q) || normalize(nombreCompeticionCorto(c)).startsWith(q))
    .flatMap(c => accionesCompeticion(c).filter(a => a.tipo !== 'calendario').map(a => ({ kind: 'orden', value: a.orden,
      label: `${nombreCompeticionCorto(c)} · ${a.texto}`, tipo: t('calDeportesTitulo') })));
  return [...prefijos, ...competiciones];
}
