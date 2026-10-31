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
// orden elegida; el resto (medios, palabras, fechas) se queda.
function escribirAcceso(orden){
  const { antes } = partirConsulta($('#buscar').value);
  const resto = tokenizeQuery(antes).filter(tk => !(tk.prefix && leerConsultaCalendario(tk.raw))).map(tk => tk.raw);
  cerrarAccesos(false);
  escribirBusqueda([...resto, orden].join(' '));
}

function pintarAccesos(){
  const panel = $('#accesos-panel');
  if (!panel) return;
  const p = ACCESOS.pantalla, nombre = calNombreCompeticion;
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
      ir('resultados', t('accResultados')), ir('competiciones', t('accCompeticiones'))];
  } else if (p === 'resultados'){
    titulo = t('accResultadosTitulo');
    filas = CAL_COMPETICIONES.filter(c => codigoDeporte('resultados', c)).map(c => fila('resultados:' + c, nombre(c)));
  } else if (p === 'competiciones'){
    titulo = t('accCompeticionesTitulo');
    filas = CAL_COMPETICIONES.map(c => ir('c:' + c, nombre(c)));
  } else {
    // Una competición: solo las operaciones que admite (F1 no tiene resultados).
    const c = p.slice(2);
    titulo = nombre(c);
    filas = [accesoHay(c) ? fila('calendario:' + c, t('accHorarios', { x: nombre(c) })) : '',
      codigoDeporte('resultados', c) ? fila('resultados:' + c, t('accResultadosDe', { x: nombre(c) })) : '',
      codigoDeporte('clasificacion', c) ? fila('clasificacion:' + c, t('accClasificacionDe', { x: nombre(c) })) : ''];
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
