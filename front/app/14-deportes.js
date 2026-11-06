/* ═══════════════════════════════════════════════════════════════
   DEPORTES: UNA SOLA LISTA PARA TODAS LAS ENTRADAS
   Competiciones por deporte y lo que ofrece cada una. De aquí salen la
   vista general (deportes:, resultados: sin competición), el ▾, las pestañas de una
   competición y las sugerencias. Cada enlace escribe su orden en la barra.
   ═══════════════════════════════════════════════════════════════ */
// El orden de los bloques equilibra las tres columnas de la vista general.
const DEPORTES_ORDEN = ['futbol', 'tenis', 'baloncesto', 'motor', 'atletismo'];
const DEPORTES_ACCIONES = [['resultados', 'conResultados'], ['calendario', 'calTitulo'], ['clasificacion', 'conClasificacion']];
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
    pintarCabeceraCompeticion();
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
    .map(([tipo, texto]) => ({ tipo, texto: t(texto), orden: `${tipo}:${c}` }));
  return noticias && AMBITOS[c]?.noticias ? [...acciones, { tipo: 'noticias', texto: t('conNoticias'), orden: `${c}:noticias` }] : acciones;
}

// El nombre hace lo que se pidió; lo demás queda al lado. Con `contexto`
// (resultados:, clasificacion:) solo salen las competiciones que lo tienen y el
// nombre basta; sin él, abre lo primero que haya y escribe adónde lleva.
function filaCompeticion(c, contexto = ''){
  const acciones = accionesCompeticion(c), nombre = nombreCompeticionCorto(c);
  const principal = contexto ? acciones.find(a => a.tipo === contexto) : acciones[0];
  if (!principal) return '';
  const boton = (a, clase, html) => `<button type="button" class="${clase}" data-accion="orden" data-orden="${escapeHtml(a.orden)}" aria-label="${escapeHtml(`${nombre}: ${a.texto}`)}">${html}</button>`;
  const otras = acciones.filter(a => a !== principal).map(a => boton(a, 'dep-accion', escapeHtml(a.texto))).join('');
  return `<div class="dep-fila">${boton(principal, 'dep-nombre', escapeHtml(nombre) + (contexto ? '' : ` <small>· ${escapeHtml(principal.texto)}</small>`))}${otras ? `<span class="dep-otras">${otras}</span>` : ''}</div>`;
}
const contextoDeportes = tipo => ['resultados', 'clasificacion'].includes(tipo) ? tipo : '';

// Arriba del cuadro: lo de hoy y el finde, el calendario y lo que sigo.
function htmlInicioDeportes(sigo){
  const orden = (o, texto) => `<button type="button" data-accion="orden" data-orden="${escapeHtml(o)}">${escapeHtml(texto)}</button>`;
  const filas = sigo.map(c => filaCompeticion(c)).join('');
  return `<div class="dep-inicio"><div class="dep-atajos ui-tira">${orden('hoy:deportes', t('calHoy'))}${orden('finde:deportes', t('calFinde'))}
    <button type="button" data-accion="calendario-deportes">${escapeHtml(t('calTitulo'))}</button></div>
    ${filas ? `<div class="dep-sigo">${filas}</div>` : ''}</div>`;
}
// El botón Deportes: el cuadro general, que es una consulta y se escribe como
// «‹ Deportes». Pulsado con el cuadro abierto, lo cierra.
function pulsarBotonDeportes(){
  cerrarEstadisticas(false);
  if (PUNTUAL.activa?.tipo === 'deportes' && !CALENDARIO.abierto) return conPaso(quitarConsultas);
  irDesdeCalendario('deportes:');
}
function abrirCalendarioDeportes(){
  conPaso(() => { quitarConsultas(); abrirCalendario(document.getElementById('btn-deportes'), 'deportes'); });
}
// Vista general: en pantalla ancha, todo a la vista; en móvil, plegada salvo lo
// que sigo o, sin nada seguido, el primer bloque.
function htmlVistaDeportes(tipo){
  const sigo = calPreferencias()?.competiciones || [];
  const estrecha = globalThis.matchMedia?.('(max-width: 600px)').matches;
  const bloques = DEPORTES_ORDEN.map(k => ({ k, cs: competicionesDeporte(k), filas: competicionesDeporte(k).map(c => filaCompeticion(c, contextoDeportes(tipo))).join('') }))
    .filter(b => b.filas);
  return `${tipo === 'deportes' ? htmlInicioDeportes(sigo) : ''}<div class="dep-vista">${bloques.map((b, i) => {
    const abierto = !estrecha || b.cs.some(c => sigo.includes(c)) || (!sigo.length && i === 0);
    return `<details class="dep-bloque"${abierto ? ' open' : ''}><summary>${escapeHtml(t(CAL_NOMBRES_DEPORTE[b.k]))}</summary>${b.filas}</details>`;
  }).join('')}</div>`;
}

// `resultados:feb-primera` o `resultados:xyz`: se dice por qué sale la vista general
// y, si la competición existe, se ofrece lo que sí tiene.
function avisoSinConsulta({ tipo, texto }){
  const codigo = normalize(texto);
  if (!codigo) return '';
  const acciones = accionesCompeticion(codigo);
  if (!acciones.length && !Object.hasOwn(AMBITOS, codigo)) return msgConsulta('conNoReconocida', { x: texto });
  return msgConsulta('conSinVista', { x: nombreCompeticionCorto(codigo), y: nombreConsulta(tipo).toLowerCase() })
    + opcionesConsulta(acciones.map(a => `<button type="button" data-accion="orden" data-orden="${escapeHtml(a.orden)}">${escapeHtml(a.texto)}</button>`).join(''));
}

// Competición que enseña el panel, si es una ficha de resultados o clasificación
// (también mientras carga, si falla y dentro de un partido).
function competicionConsulta(){
  const { activa: c, estado } = PUNTUAL;
  if (!c || !['resultados', 'clasificacion'].includes(c.tipo) || estado === 'ayuda') return '';
  const codigo = normalize(c.texto);
  return codigoDeporte(c.tipo, codigo) ? codigo : '';
}
// Bajo resultados y clasificación, las noticias de esa competición y no el feed
// general: el filtro de `primera:noticias`, solo con lo ya descargado. Abrir una
// ficha no debe pedir a la prensa.
function noticiasDeLaFicha(){
  const c = competicionConsulta();
  return AMBITOS[c]?.noticias ? { ambitos: [c], circuitos: [], tipos: ['noticias'], desconocidos: [], resto: '', noticias: true, sinPrensa: true } : null;
}
// Competición y vista en pantalla: la misma cabecera para las cuatro vistas.
function vistaCompeticion(){
  if (CALENDARIO.abierto){
    const c = calCabCompeticion();
    return c ? { codigo: c, tipo: 'calendario' } : null;
  }
  const c = competicionConsulta();
  if (c) return { codigo: c, tipo: PUNTUAL.activa.tipo };
  const o = CALENDARIO.orden, n = o?.ambitos || [];
  return o?.tipos.join() === 'noticias' && !o.circuitos.length && n.length === 1 && AMBITOS[n[0]]?.codigo
    ? { codigo: n[0], tipo: 'noticias' } : null;
}
// Las hermanas salen del deporte, no de la vista: no cambian al pasar de pestaña.
// Una que no tenga esta vista lleva a la primera que tenga.
function htmlCabeceraCompeticion(codigo, tipo){
  const boton = (orden, texto, actual, valorActual) => `<button type="button" data-orden="${escapeHtml(orden)}"${actual ? ` aria-current="${valorActual}"` : ''}>${escapeHtml(texto)}</button>`;
  const deporte = DEPORTES_ORDEN.find(k => competicionesDeporte(k).includes(codigo));
  const destino = c => { const a = accionesCompeticion(c, { noticias: true }); return a.find(x => x.tipo === tipo) || a[0]; };
  const hermanas = deporte ? competicionesDeporte(deporte).filter(destino) : [];
  return `<div class="dep-cab">${boton('deportes:', '‹ ' + t('calDeportesTitulo'))}
    <div class="dep-tabs">${accionesCompeticion(codigo, { noticias: true }).map(a => boton(a.orden, a.texto, a.tipo === tipo, 'page')).join('')}</div>
    ${hermanas.length > 1 ? `<div class="dep-hermanas ui-tira" role="group" aria-label="${escapeHtml(t('conOtrasCompeticiones'))}">${hermanas.map(c =>
      boton(destino(c).orden, nombreCompeticionCorto(c), c === codigo, 'true')).join('')}</div>` : ''}
    <button type="button" class="dep-cerrar" data-cerrar aria-label="${escapeHtml(t('conCerrar'))}" title="${escapeHtml(t('conCerrar'))}">${ico('x')}</button></div>`;
}
const DEPORTES_CAB = { html: '', dia: '' };
function pintarCabeceraCompeticion(){
  const nav = document.getElementById('competicion-cab');
  if (!nav) return;
  const v = vistaCompeticion(), s = CALENDARIO, activa = PUNTUAL.activa;
  const clases = document.body.classList;
  const deportes = Boolean(v) || (s.abierto ? calModoDeportes() : Boolean(activa && esDeporteConsulta(activa.tipo)));
  clases.toggle('vista-deportes', deportes);
  document.getElementById('btn-deportes')?.setAttribute('aria-expanded', String(deportes));
  clases.toggle('con-competicion', Boolean(v));
  // Las etiquetas de las consultas repiten la cabecera; las de otros filtros, no.
  clases.toggle('sin-chips', document.querySelectorAll('#chips-busqueda .chip').length <= PUNTUAL.lista.length);
  const html = v ? htmlCabeceraCompeticion(v.codigo, v.tipo) : '';
  // Al salir del calendario hay un repintado sin competición: no es dejarla.
  if (!v && !PASOS.dentro) DEPORTES_CAB.dia = '';
  if (html === DEPORTES_CAB.html) return;
  const foco = nav.contains(document.activeElement) ? document.activeElement : null;
  const orden = foco?.dataset.orden, zona = foco?.closest('.dep-hermanas') ? '.dep-hermanas' : '.dep-tabs';
  DEPORTES_CAB.html = nav.innerHTML = html;
  nav.hidden = !v;
  if (nav.hidden) return;
  nav.setAttribute('aria-label', t('conSecciones'));
  if (foco) (nav.querySelector(`${zona} [data-orden="${orden}"]`) || nav.querySelector('.dep-tabs [aria-current]'))?.focus({ preventScroll: true });
}
// Cambiar de vista conserva el día: clasificación no tiene fecha, pero se recuerda
// para la vuelta. Resultados solo sabe de días pasados y de hoy.
function irACompeticion(orden){
  const s = CALENDARIO, p = PUNTUAL, tipo = orden.slice(0, orden.indexOf(':'));
  const dia = DEPORTES_CAB.dia = (s.abierto ? s.fecha : p.origen?.fecha || p.fecha) || DEPORTES_CAB.dia;
  if (tipo === 'resultados' && fechaValida(dia) && dia <= calHoy()) p.fechaPedida = dia;
  if (tipo === 'calendario') s.diaPedido = dia;
  conPaso(() => {
    if (s.abierto && tipo !== 'calendario') cerrarCalendario(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
    escribirAcceso(orden);
  });
  p.fechaPedida = s.diaPedido = '';
}
function pulsarCabeceraCompeticion(e){
  const b = e.target.closest('button');
  if (!b) return;
  if ('cerrar' in b.dataset){
    conPaso(() => { cerrarCalendario(false); escribirAcceso(''); });
    return void document.getElementById('btn-deportes')?.focus({ preventScroll: true });
  }
  // La pestaña en la que se está: dentro de un partido, vuelve a la lista.
  if (b.closest('.dep-tabs') && b.hasAttribute('aria-current')) return void document.querySelector('#consulta-panel .consulta-volver')?.click();
  if (b.dataset.orden !== 'deportes:'){
    // Al salir del calendario la cabecera se vacía un momento: el foco se repone aquí.
    const zona = b.closest('.dep-hermanas') ? '.dep-hermanas' : '.dep-tabs';
    irACompeticion(b.dataset.orden);
    return void document.querySelector(`#competicion-cab ${zona} [aria-current]`)?.focus({ preventScroll: true });
  }
  irACompeticion('deportes:');
  // Después: activar la consulta limpia el foco pendiente.
  PUNTUAL.enfocar = '.dep-nombre';
  pintarConsulta();
}

// Desde el calendario: Deportes abierto con su botón no se cierra al escribir la orden.
function irDesdeCalendario(orden){
  conPaso(() => {
    cerrarCalendario(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
    escribirAcceso(orden);
  });
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
