/* ═══════════════════════════════════════════════════════════════
   ACCESOS DEL BUSCADOR (▾ al final de la barra, como las opciones de Gmail)
   Horarios, resultados y clasificación de las competiciones con el ratón.
   Cada acceso escribe su orden en la barra y la aplica (modelo GitHub: el
   filtro activo se ve y se aprende); los botones de las vistas no escriben.
   ═══════════════════════════════════════════════════════════════ */
const ACCESOS = { abierto: false, pantalla: '', disp: null, cargando: null };
const ACCESOS_PRIMERAS = 4;
const ACCESOS_POR_DEFECTO = ['f1', 'primera', 'nba'];

// Competiciones con algo publicado (disponibilidad global del catálogo): una
// petición al abrir por primera vez; si falla, se ofrecen todas.
async function accesosDisponibilidad(){
  if (ACCESOS.disp || ACCESOS.cargando) return;
  const controller = ACCESOS.cargando = new AbortController();
  try { ACCESOS.disp = (await calPedir('catalogo', { disponibilidad: 1 }, controller.signal)).disponibilidad?.circuitos || {}; }
  catch { ACCESOS.disp = null; }
  ACCESOS.cargando = null;
  if (ACCESOS.abierto) pintarAccesos();
}
const accesoHay = c => !ACCESOS.disp || ACCESOS.disp[c] > 0;

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
  escribirBusqueda([...resto, orden].filter(Boolean).join(' ') + (orden.endsWith(':') ? ' ' : ''));
}

function pintarAccesos(){
  const panel = $('#accesos-panel');
  if (!panel) return;
  const p = ACCESOS.pantalla, nombre = calNombreCompeticion;
  // La orden no se repite en la fila: al pulsar se escribe en la barra y ahí se aprende.
  const fila = (orden, texto) => `<li><button type="button" data-orden="${calEsc(orden)}">${calEsc(texto)}</button></li>`;
  const ir = (pantalla, texto) => `<li><button type="button" data-pantalla="${calEsc(pantalla)}">${calEsc(texto)}<span aria-hidden="true"> ›</span></button></li>`;
  let titulo = t('accTitulo'), filas = [];
  if (!p){
    // Lo que sigo primero (★ de Deportes); sin nada, unas pocas conocidas.
    const sigo = (calPreferencias()?.competiciones || []).filter(accesoHay);
    const primeras = [...sigo, ...ACCESOS_POR_DEFECTO.filter(c => !sigo.includes(c) && accesoHay(c))].slice(0, ACCESOS_PRIMERAS);
    const futbol = CAL_DEPORTES.futbol.filter(accesoHay);
    filas = [sigo.length > 1 ? fila('calendario:' + sigo.join(','), t('accSigoHorarios')) : '',
      ...primeras.map(c => fila('calendario:' + c, t('accHorarios', { x: nombre(c) }))),
      futbol.length > 1 && !futbol.every(c => primeras.includes(c)) ? fila('calendario:' + futbol.join(','), t('accHorarios', { x: t('calFutbol') })) : '',
      ir('resultados', t('accResultados')), ir('clasificaciones', t('accClasificaciones')), ir('competiciones', t('accCompeticiones'))];
  } else if (p === 'resultados'){
    titulo = t('accResultadosTitulo');
    filas = CAL_COMPETICIONES.filter(c => codigoDeporte('resultados', c)).map(c => fila('resultados:' + c, nombre(c)));
  } else if (p === 'clasificaciones'){
    titulo = t('accClasificacionesTitulo');
    filas = CAL_COMPETICIONES.filter(c => codigoDeporte('clasificacion', c)).map(c => fila('clasificacion:' + c, nombre(c)));
  } else if (p === 'competiciones'){
    titulo = t('accCompeticionesTitulo');
    filas = CAL_COMPETICIONES.map(c => ir('c:' + c, nombre(c)));
  } else {
    // Una competición: solo las operaciones que admite (F1 no tiene resultados).
    const c = p.slice(2);
    titulo = nombre(c);
    filas = [accesoHay(c) ? fila('calendario:' + c, t('accHorarios', { x: nombre(c) })) : '',
      codigoDeporte('resultados', c) ? fila('resultados:' + c, t('accResultadosDe', { x: nombre(c) })) : '',
      codigoDeporte('clasificacion', c) ? fila('clasificacion:' + c, t('accClasificacionDe', { x: nombre(c) })) : '',
      // Solo noticias, sin abrir Deportes; en el modo o en todo, con sus pestañas.
      AMBITOS[c]?.noticias ? fila(c + ':noticias', t('accNoticiasDe', { x: nombre(c) })) : ''];
  }
  const volver = p ? `<button type="button" class="accesos-volver" data-volver="${p.startsWith('c:') ? 'competiciones' : ''}" aria-label="${calEsc(t('accVolver'))}">‹</button>` : '';
  panel.innerHTML = `<div class="accesos-cab">${volver}<h2 id="accesos-titulo" tabindex="-1">${calEsc(titulo)}</h2>
    <button type="button" class="accesos-cerrar" data-cerrar aria-label="${calEsc(t('calCerrar'))}">×</button></div>
    <ul class="accesos-lista">${filas.filter(Boolean).join('')}</ul>
    ${ACCESOS.cargando ? `<p class="accesos-estado" role="status">${calEsc(t('calCargando'))}</p>` : ''}`;
}

function abrirAccesos(){
  ACCESOS.abierto = true; ACCESOS.pantalla = '';
  cerrarSugerencias();
  const panel = $('#accesos-panel');
  panel.hidden = false;
  $('#buscar-accesos').setAttribute('aria-expanded', 'true');
  pintarAccesos();
  accesosDisponibilidad();
  panel.querySelector('.accesos-lista button')?.focus({ preventScroll: true });
}
function cerrarAccesos(volver = true){
  if (!ACCESOS.abierto) return;
  ACCESOS.abierto = false;
  $('#accesos-panel').hidden = true;
  $('#buscar-accesos').setAttribute('aria-expanded', 'false');
  if (volver) $('#buscar-accesos').focus({ preventScroll: true });
}

function wireAccesos(){
  wireIconosDeportes();
  const boton = $('#buscar-accesos'), panel = $('#accesos-panel');
  if (!boton || !panel) return;
  boton.addEventListener('click', () => ACCESOS.abierto ? cerrarAccesos() : abrirAccesos());
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('orden' in b.dataset) return escribirAcceso(b.dataset.orden);
    if ('cerrar' in b.dataset) return cerrarAccesos();
    if ('pantalla' in b.dataset || 'volver' in b.dataset){
      ACCESOS.pantalla = b.dataset.pantalla ?? b.dataset.volver;
      pintarAccesos();
      $('#accesos-titulo')?.focus({ preventScroll: true });
    }
  });
  // Escape cierra y vuelve al ▾; un clic fuera o salir con el tabulador, también.
  panel.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.stopPropagation(); cerrarAccesos(); } });
  document.addEventListener('click', e => {
    // composedPath: al cambiar de pantalla, el botón pulsado ya no está en el panel.
    if (ACCESOS.abierto && !e.composedPath().some(n => n === panel || n === boton)) cerrarAccesos(false);
  });
  panel.addEventListener('focusout', e => {
    if (ACCESOS.abierto && e.relatedTarget && !panel.contains(e.relatedTarget) && e.relatedTarget !== boton) cerrarAccesos(false);
  });
}

// ── Iconos de deporte en la cabecera ──
// Un icono por deporte de las competiciones que sigo (★ de Deportes): escribe
// sus prefijos en la barra (f1: motogp:), que abren Deportes y filtran las
// noticias respetando el modo; pulsado otra vez, los quita (como el ☀).
const ICONOS_DEPORTE = {
  futbol: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 2.9-1.5 4.7h-5L8 10.4Z"/>',
  baloncesto: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8"/>',
  motor: '<path d="M5 21V4h13l-2 4 2 4H5"/><path d="M9 4v8M13 4v8M5 8h13"/>',
  tenis: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8"/>',
};
function deportesSeguidos(){
  const sigo = calPreferencias()?.competiciones || [];
  return Object.entries(CAL_DEPORTES).map(([k, cs]) => [k, cs.filter(c => sigo.includes(c))]).filter(([, cs]) => cs.length);
}
// Pulsado si la barra pide exactamente esas competiciones.
function iconoPulsado(cs){
  const o = CALENDARIO.orden, ambitos = o && !o.circuitos.length ? o.ambitos : [];
  return ambitos.length === cs.length && cs.every(c => ambitos.includes(c));
}
function pintarIconosDeportes(){
  const el = $('#cab-deportes');
  if (!el) return;
  const deportes = deportesSeguidos();
  el.hidden = !deportes.length;
  el.setAttribute('aria-label', t('calCompeticiones'));
  el.innerHTML = deportes.map(([k, cs]) => {
    const etiqueta = t(CAL_NOMBRES_DEPORTE[k]) + ': ' + cs.map(calNombreCompeticion).join(', ');
    return `<button type="button" class="btn-cab cab-deporte cal-dep-${k}" data-deporte="${k}" aria-pressed="${iconoPulsado(cs)}" aria-label="${calEsc(etiqueta)}" title="${calEsc(etiqueta)}">
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONOS_DEPORTE[k]}</svg></button>`;
  }).join('');
}
function wireIconosDeportes(){
  const el = $('#cab-deportes');
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-deporte]');
    if (!b) return;
    const cs = deportesSeguidos().find(([k]) => k === b.dataset.deporte)?.[1] || [];
    escribirAcceso(iconoPulsado(cs) ? '' : cs.map(c => c + ':').join(' '));
  });
  pintarIconosDeportes();
}
