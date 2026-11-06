/* ═══════════════════════════════════════════════════════════════
   ACCESOS DEL BUSCADOR (▾ al final de la barra, como las opciones de Gmail)
   Lanzador corto: lo que sigo y el camino a la vista general de deportes.
   Cada acceso escribe su orden en la barra y la aplica (modelo GitHub: el
   filtro activo se ve y se aprende). El botón Agenda no escribe; el de Deportes
   abre el cuadro general, que es una consulta, y por eso escribe `deportes:`.
   ═══════════════════════════════════════════════════════════════ */
const ACCESOS = { abierto: false };
const ACCESOS_PRIMERAS = 4;
const ACCESOS_POR_DEFECTO = ['f1', 'primera', 'nba'];

// Atrás del navegador: cada vista elegida es un paso con lo escrito en la barra y
// la vista abierta desde su botón. Lo que se va tecleando no crea pasos.
const PASOS = { dentro: 0 };
const pasoActual = () => ({ barra: $('#buscar').value.trim(), vista: CALENDARIO.abierto && !CALENDARIO.porPrefijo ? CALENDARIO.vista : '' });
const mismoPaso = (a, b) => a?.barra === b.barra && a?.vista === b.vista;
function anotarPaso(){ history.replaceState({ ...history.state, paso: pasoActual() }, ''); }
function marcarPaso(){
  const paso = pasoActual();
  if (!mismoPaso(history.state?.paso, paso)) history.pushState({ paso }, '');
}
function conPaso(cambio){
  if (!PASOS.dentro++) anotarPaso();
  try { cambio(); } finally { if (!--PASOS.dentro) marcarPaso(); }
}
function volverAPaso(e){
  const paso = e.state?.paso, s = CALENDARIO;
  if (!paso || mismoPaso(paso, pasoActual())) return;
  if (!paso.vista && s.abierto && !s.porPrefijo) cerrarCalendario(false);
  if (paso.barra !== $('#buscar').value.trim()) escribirBusqueda(paso.barra);
  if (paso.vista) abrirCalendario(document.getElementById(paso.vista === 'deportes' ? 'btn-deportes' : 'btn-calendario'), paso.vista);
}

// Sustituye en la barra lo que era de la agenda o una consulta puntual por la
// orden elegida; el resto (medios, palabras, fechas) se queda. Las consultas
// deportivas (resultados:primera) no van al final de la línea: se quitan aquí.
function escribirAcceso(orden){
  const { antes } = partirConsulta($('#buscar').value);
  const resto = tokenizeQuery(antes)
    .filter(tk => !(tk.prefix && (leerConsultaCalendario(tk.raw) || Object.hasOwn(PREFIJOS_CONSULTAS, tk.prefix))))
    .map(tk => tk.raw);
  cerrarAccesos(false);
  // Un prefijo deja un espacio detrás: lo que se escriba después es texto (f1: alonso).
  conPaso(() => escribirBusqueda([...resto, orden].filter(Boolean).join(' ') + (orden.endsWith(':') ? ' ' : '')));
}

function pintarAccesos(){
  const panel = $('#accesos-panel');
  if (!panel) return;
  const fila = (atributo, texto) => `<li><button type="button" ${atributo}>${calEsc(texto)}</button></li>`;
  // Lo que sigo primero (★ de Deportes); sin nada, unas pocas conocidas.
  const sigo = calPreferencias()?.competiciones || [];
  const primeras = [...sigo, ...ACCESOS_POR_DEFECTO.filter(c => !sigo.includes(c))].map(c => filaCompeticion(c, contextoDeportes(PUNTUAL.activa?.tipo))).filter(Boolean).slice(0, ACCESOS_PRIMERAS);
  const noticias = deportesSeguidos().map(([k, cs]) => fila(`data-orden="${calEsc(cs.map(c => c + ':').join(' '))}"`, t('accNoticiasDe', { x: t(CAL_NOMBRES_DEPORTE[k]) })));
  panel.innerHTML = `<div class="accesos-cab"><h2 id="accesos-titulo" tabindex="-1">${calEsc(t('accTitulo'))}</h2>
    <button type="button" class="accesos-cerrar" data-cerrar aria-label="${calEsc(t('calCerrar'))}">×</button></div>
    <div class="accesos-filas">${primeras.join('')}</div>
    <ul class="accesos-lista">${[...noticias, fila('data-orden="hoy:deportes"', t('accHoyDeportes') + ' ›'), fila('data-orden="deportes:"', t('accTodosDeportes') + ' ›'), fila('data-deportes', t('accCalendarioDeportes') + ' ›')].join('')}</ul>
    ${DEPORTES_DISP.cargando ? `<p class="accesos-estado" role="status">${calEsc(t('calCargando'))}</p>` : ''}`;
}

function abrirAccesos(){
  ACCESOS.abierto = true;
  cerrarSugerencias();
  const panel = $('#accesos-panel');
  panel.hidden = false;
  $('#buscar-accesos').setAttribute('aria-expanded', 'true');
  pedirDisponibilidadDeportes();
  pintarAccesos();
  panel.querySelector('.dep-nombre, .accesos-lista button')?.focus({ preventScroll: true });
}
function cerrarAccesos(volver = true){
  if (!ACCESOS.abierto) return;
  ACCESOS.abierto = false;
  $('#accesos-panel').hidden = true;
  $('#buscar-accesos').setAttribute('aria-expanded', 'false');
  if (volver) $('#buscar-accesos').focus({ preventScroll: true });
}

function wireAccesos(){
  const boton = $('#buscar-accesos'), panel = $('#accesos-panel');
  anotarPaso();
  window.addEventListener('popstate', volverAPaso);
  document.getElementById('competicion-cab')?.addEventListener('click', pulsarCabeceraCompeticion);
  // Después de que las sugerencias apliquen la suya.
  $('#buscar')?.addEventListener('keydown', e => { if (e.key === 'Enter') setTimeout(marcarPaso); });
  if (!boton || !panel) return;
  boton.addEventListener('click', () => ACCESOS.abierto ? cerrarAccesos() : abrirAccesos());
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('orden' in b.dataset) return escribirAcceso(b.dataset.orden);
    if ('cerrar' in b.dataset) return cerrarAccesos();
    if ('deportes' in b.dataset){ cerrarAccesos(false); conPaso(() => abrirCalendario(document.getElementById('btn-deportes'), 'deportes')); }
  });
  // Escape cierra y vuelve al ▾; un clic fuera o salir con el tabulador, también.
  panel.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.stopPropagation(); cerrarAccesos(); } });
  document.addEventListener('click', e => {
    if (ACCESOS.abierto && !e.composedPath().some(n => n === panel || n === boton)) cerrarAccesos(false);
  });
  panel.addEventListener('focusout', e => {
    if (ACCESOS.abierto && e.relatedTarget && !panel.contains(e.relatedTarget) && e.relatedTarget !== boton) cerrarAccesos(false);
  });
}

// Deportes que sigo (★ de Deportes): [deporte, competiciones con datos].
// Cada uno da una fila «Fútbol · noticias» en el ▾, que escribe sus prefijos
// (primera: segunda:), como antes los iconos de la cabecera.
function deportesSeguidos(){
  const sigo = calPreferencias()?.competiciones || [];
  return Object.entries(CAL_DEPORTES).map(([k, cs]) => [k, cs.filter(c => sigo.includes(c) && accesoHay(c))]).filter(([, cs]) => cs.length);
}
