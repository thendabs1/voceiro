/* ============================================================
   19. LECTOR
   ============================================================ */
// El lector abierto, si lo hay: el puente lo avisa cuando la configuración
// cambia en otra pestaña (o llega de Voceiro) para que se repinte.
let __lectorAbierto = null;

function openReader(art){
  if (document.getElementById('il-full')) return;
  art = { ...art, url: urlWebValida(art.url || location.href) };
  if (!art.url) return;
  const articleUrl = art.url;

  // let: CFG se sustituye entero cuando cambia en otra pestaña (refrescar).
  let prefs = CFG.prefs;
  const pageLang = detectPageLang();
  const defaultDict = getDefaultDict(pageLang);
  const defaultDictName = defaultDict ? defaultDict.name : '—';

  const rawBody = String(art.rawBody || '')
    .replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const rawHTML = String(art.rawHTML || '');
  const useHTML = !!rawHTML;
  const plainBody = useHTML ? stripTags(rawHTML).replace(/\s+/g,' ').trim() : rawBody;
  if (!plainBody || plainBody.length < 100){ toast(t('noArticle')); return; }

  const headline = art.headline || document.title || '';
  const description = art.description || '';
  const articleSection = art.articleSection || '';
  const autores = art.autores || '';
  let fecha = (art.datePublished || '').slice(0,10);
  if (!fecha){
    const tEl = document.querySelector('time[datetime]');
    if (tEl) fecha = (tEl.getAttribute('datetime') || '').slice(0,10);
  }

  const srcKey = art._source || (rawHTML ? 'readability' : 'jsonld');
  const srcName = srcKey === 'jsonld' ? t('srcJsonld')
                : srcKey === 'mixto' ? t('srcMixto')
                : srcKey === 'custom' ? t('srcCustom')
                : srcKey === 'all' ? t('extractionModeAll')
                : t('srcReadability');
  // Fuera las imágenes repetidas y, si viene del DOM, las promociones del
  // medio al principio y al final («¿Ya nos sigues?», newsletters…).
  let parrafos = art.bloques || (useHTML ? buildBlocksFromHTML(rawHTML) : buildBlocksFromText(rawBody));
  parrafos = sinImagenesRepetidas(parrafos);
  if (srcKey !== 'jsonld') parrafos = sinPromosEnBordes(parrafos, textoDeBloque);
  parrafos = agruparGalerias(parrafos);
  // Las palabras del texto que se ve, no las de lo que se ha quitado.
  const wordsCount = countWords(parrafos.filter(esDeTexto).map(textoDeBloque).join(' '));

  const iu = urlWebValida(absUrl(String(art.image || '')));
  const iuHi = iu.replace('_16-9-discover-', '_source-');
  const iuFinal = iuHi !== iu ? iuHi : iu;
  const iuFallback = iuHi !== iu ? iu : '';
  const cap = art.imageCaption || '';
  const auImg = art.imageAuthor || '';
  // La portada repetida como primera imagen del cuerpo sale una sola vez,
  // en el cuerpo y con su pie.
  const imagenesCuerpo = parrafos.flatMap(b => b.tipo === 'galeria' ? b.imagenes : b.tipo === 'img' ? [b] : []);
  const enCuerpo = iu ? imagenesCuerpo.find(b => claveImagen(b.src) === claveImagen(iu)) : null;
  if (enCuerpo && !enCuerpo.caption && cap) enCuerpo.caption = cap;

  function renderBlock(b){
    const process = html => prefs.bionic ? bionicizeHTML(html) : html;
    if (b.tipo === 'img'){
      return '<figure class="il-inline-figure' + (b.caption ? ' il-con-pie' : '') + '"' +
        (b === enCuerpo ? ' id="il-portada"' : '') + '>' +
        '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || '') + '" loading="lazy">' +
        (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') +
      '</figure>';
    }
    if (b.tipo === 'galeria'){
      const n = b.imagenes.length;
      return '<figure class="il-galeria' + (b.imagenes.some(x => x.caption) ? ' il-con-pie' : '') + '">' +
        '<div class="il-galeria-rejilla">' + b.imagenes.map(x =>
          '<img src="' + esc(x.src) + '" alt="' + esc(x.alt || '') + '" loading="lazy"' +
          (x.caption ? ' data-pie="' + esc(x.caption) + '"' : '') + (x === enCuerpo ? ' id="il-portada"' : '') + '>').join('') +
        '</div><figcaption>' + esc(t('galeria').replace('{N}', n)) + ' · ' + esc(t('galeriaPulsa')) + '</figcaption></figure>';
    }
    if (b.tipo === 'embed'){
      // Tarjeta con enlace al original: no se carga nada de terceros.
      const nombre = NOMBRES_REDES[b.red] || b.red;
      const clase = CLASES_EMBEBIDO[b.clase] ? t(CLASES_EMBEBIDO[b.clase]) + ' · ' : '';
      return '<aside class="il-embed" aria-label="' + esc(t('embebidoDe').replace('{X}', nombre)) + '">' +
        '<p class="il-embed-red">' + esc(clase + nombre) + '</p>' +
        (b.texto ? '<p class="il-embed-texto">' + process(esc(b.texto)) + '</p>' : '') +
        '<a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer">' + icono('external-link') +
        '<span>' + esc(t('verEn').replace('{X}', nombre)) + '</span></a></aside>';
    }
    if (b.tipo === 'tabla'){
      // Con scroll propio en pantallas estrechas; tabindex para moverla con
      // el teclado.
      return '<div class="il-tabla" role="region" tabindex="0" aria-label="' + esc(b.caption || t('tabla')) + '">' +
        process(b.html || '') + '</div>';
    }
    if (b.tipo === 'q') return '<blockquote>' + process(b.html || '') + '</blockquote>';
    if (b.tipo === 'h') return '<h' + b.level + '>' + process(b.html || '') + '</h' + b.level + '>';
    if (b.tipo === 'hr') return '<hr>';
    if (b.tipo === 'pre') return '<pre>' + (b.html || '') + '</pre>';
    if (b.tipo === 'list'){
      const tag = b.ordered ? 'ol' : 'ul';
      return '<' + tag + '>' + b.items.map(i => '<li>' + process(i) + '</li>').join('') + '</' + tag + '>';
    }
    return '<p>' + process(b.html || '') + '</p>';
  }
  function renderBody(){ return parrafos.map(renderBlock).join(''); }

  function buildText(){
    const lines = parrafos.map(b => {
      if (b.tipo === 'hr') return '---';
      if (b.tipo === 'img') return '[' + t('imageLabel') + (b.caption ? ': ' + b.caption : '') + ']';
      if (b.tipo === 'galeria') return '[' + t('galeria').replace('{N}', b.imagenes.length) + ']';
      if (b.tipo === 'embed') return '[' + (CLASES_EMBEBIDO[b.clase] ? t(CLASES_EMBEBIDO[b.clase]) + ' · ' : '') +
        (NOMBRES_REDES[b.red] || b.red) + (b.texto ? ': ' + b.texto : '') + ' — ' + b.url + ']';
      if (b.tipo === 'tabla') return textoDeTabla(b);
      if (b.tipo === 'list') return b.items.map(i => '- ' + stripTags(i)).join('\n');
      if (b.tipo === 'h') return stripTags(b.html || '');
      if (b.tipo === 'q') return '> ' + stripTags(b.html || '');
      if (b.tipo === 'pre') return stripTags(b.html || '');
      return stripTags(b.html || '');
    }).join('\n\n');
    return headline + '\n\n' +
      (description ? description + '\n\n' : '') +
      (fecha ? fecha + ' · ' : '') + articleSection +
      (autores ? ' · ' + autores : '') + '\n\n' +
      lines + '\n\nURL: ' + articleUrl;
  }

  // «Abrir en…»: los servicios que haya configurado cada persona.
  const servicios = serviciosConfigurados();

  // Una opción del panel Apariencia: radio o casilla nativos (teclado y
  // lectores de pantalla de serie) con su texto; el ✓ dice cuál está
  // elegida, no solo el color.
  function opcion(tipo, nombre, valor, texto, muestra){
    const p = muestra ? (typeof muestra === 'object' ? muestra : (PALETA[muestra] || {})) : null;
    return '<label class="il-opcion' + (p ? ' il-muestra' : '') + '"' +
      (p ? ' style="' + esc('--muestra-bg:' + p.bg + ';--muestra-fg:' + p.fg + ';--muestra-borde:' + p['btn-border']) + '"' : '') + '>' +
      '<input type="' + tipo + '" name="' + nombre + '" value="' + esc(valor) + '">' +
      '<span>' + esc(texto) + '</span></label>';
  }
  function muestraPersonalizada(){
    const c = limpiarColores(prefs.colores) || coloresDelTema(prefs.theme) || {};
    return { bg: c.fondo, fg: c.texto, 'btn-border': c.texto };
  }
  function colorHTML(clave, etiqueta){
    return '<div class="il-color"><input type="color" id="il-color-' + clave + '" data-color="' + clave + '">' +
      '<label for="il-color-' + clave + '">' + esc(etiqueta) + '</label>' +
      (clave === 'fondo' ? '' : '<span class="il-cr" data-cr="' + clave + '"></span>') + '</div>';
  }
  function paso(clase, etiqueta, menos, mas){
    return '<div class="il-paso" role="group" aria-labelledby="il-paso-' + clase + '">' +
      '<span class="il-paso-etq" id="il-paso-' + clase + '">' + esc(etiqueta) + '</span>' +
      '<button type="button" class="il-' + clase + '-minus" aria-label="' + esc(menos) + '">' + icono('minus') + '</button>' +
      '<output class="il-' + clase + '-val" aria-live="polite"></output>' +
      '<button type="button" class="il-' + clase + '-plus" aria-label="' + esc(mas) + '">' + icono('plus') + '</button>' +
    '</div>';
  }
  const panelAa =
    '<div id="il-panel-aa" class="il-panel" role="dialog" aria-label="' + esc(t('apariencia')) + '" hidden>' +
      '<fieldset><legend>' + esc(t('theme')) + '</legend>' +
        opcion('radio', 'il-tema', 'light', t('light'), 'light') +
        opcion('radio', 'il-tema', 'sepia', t('sepia'), 'sepia') +
        opcion('radio', 'il-tema', 'dark', t('dark'), 'dark') +
        opcion('radio', 'il-tema', 'contrast', t('contrast'), 'contrast') +
        opcion('radio', 'il-tema', 'custom', t('personalizado'), muestraPersonalizada()) +
      '</fieldset>' +
      // Tema personalizado: cuatro colores (shared/tema/personalizado.js saca
      // el resto) y el contraste de cada uno con el fondo.
      '<fieldset class="il-colores" hidden><legend>' + esc(t('personalizado')) + '</legend>' +
        colorHTML('fondo', t('colorFondo')) + colorHTML('texto', t('colorTexto')) +
        colorHTML('enlaces', t('colorEnlaces')) + colorHTML('titulos', t('colorTitulos')) +
      '</fieldset>' +
      '<fieldset><legend>' + esc(t('font')) + '</legend>' +
        opcion('radio', 'il-letra', 'georgia', t('serif')) +
        opcion('radio', 'il-letra', 'sans', t('sans')) +
        opcion('radio', 'il-letra', 'dyslexic', t('dyslexic')) +
      '</fieldset>' +
      paso('fs', t('size'), t('letraMenor'), t('letraMayor')) +
      paso('w', t('width'), t('masEstrecho'), t('masAncho')) +
      '<fieldset><legend>' + esc(t('extra')) + '</legend>' +
        opcion('checkbox', 'il-pref', 'just', t('justify')) +
        opcion('checkbox', 'il-pref', 'bionic', t('bionic')) +
        opcion('checkbox', 'il-pref', 'focus', t('focus')) +
      '</fieldset>' +
      '<fieldset><legend>' + esc(t('imgMedio')) + '</legend>' +
        opcion('radio', 'il-img-medio', '', t('imgComoSiempre')) +
        opcion('radio', 'il-img-medio', 'todas', t('imgTodas')) +
        opcion('radio', 'il-img-medio', 'conPie', t('imgConPie')) +
        opcion('radio', 'il-img-medio', 'ninguna', t('imgNinguna')) +
      '</fieldset>' +
      '<fieldset><legend>' + esc(t('source')) + '</legend>' +
        opcion('radio', 'il-origen', 'auto', t('srcAuto')) +
        opcion('radio', 'il-origen', 'jsonld', t('srcJsonld')) +
        opcion('radio', 'il-origen', 'readability', t('srcReadability')) +
      '</fieldset>' +
    '</div>';

  function itemMenu(clase, ico, texto){
    return '<button type="button" role="menuitem" tabindex="-1" class="' + clase + '">' +
      ico + '<span>' + esc(texto) + '</span></button>';
  }
  const menuMasHTML =
    '<div id="il-menu-mas" class="il-menu" role="menu" aria-label="' + esc(t('masAcciones')) + '" hidden>' +
      (servicios.length
        ? '<div role="group" aria-label="' + esc(t('abrirEn')) + '">' +
            '<div class="il-menu-grupo" aria-hidden="true">' + esc(t('abrirEn')) + '</div>' +
            servicios.map(svc =>
              '<button type="button" role="menuitem" tabindex="-1" class="il-servicio" data-servicio="' + esc(svc.id) + '">' +
                icono('external-link') + '<span>' + esc(svc.nombre) + '</span></button>').join('') +
          '</div><div role="separator"></div>'
        : '') +
      itemMenu('il-copytxt', icono('copy'), sinSimbolo(t('copyText'))) +
      itemMenu('il-rsvp-menu', icono('zap'), sinSimbolo(t('teleprompter'))) +
      itemMenu('il-print', icono('printer'), sinSimbolo(t('print'))) +
      itemMenu('il-mail', icono('mail'), sinSimbolo(t('email'))) +
      itemMenu('il-share', icono('share-2'), sinSimbolo(t('share'))) +
      '<div role="separator"></div>' +
      itemMenu('il-ignore-section', icono('ban'), sinSimbolo(t('ignoreSection'))) +
      itemMenu('il-settings-btn', icono('settings'), sinSimbolo(t('settingsShort'))) +
    '</div>';

  const progressHTML =
    '<div class="il-progress" aria-hidden="true"><div class="il-progress-bar"></div></div>';

  // Barra: volver a Voceiro (cierra la pestaña) · Apariencia · Pendientes ·
  // Más · Salir del lector. En pantallas estrechas solo se ven los iconos;
  // los textos siguen ahí para los lectores de pantalla.
  const toolbarHTML =
    progressHTML +
    '<div class="il-topbar">' +
      '<div class="il-nav-row">' +
        '<button type="button" class="il-voceiro-btn" aria-label="' + esc(t('volverVoceiro')) + '">' +
          icono('arrow-left') + '<span class="il-lbl">Voceiro</span></button>' +
        '<span class="il-nav-espacio"></span>' +
        '<button type="button" class="il-aa-btn" aria-expanded="false" aria-controls="il-panel-aa">' +
          icono('a-large-small') + '<span class="il-lbl">' + esc(t('apariencia')) + '</span></button>' +
        '<button type="button" class="il-pendientes-btn">' +
          icono('library') + '<span class="il-lbl">' + esc(t('pendientesShort')) + '</span></button>' +
        '<button type="button" class="il-mas-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="il-menu-mas" aria-label="' + esc(t('masAcciones')) + '">' +
          icono('ellipsis') + '<span class="il-lbl">' + esc(t('mas')) + '</span></button>' +
        '<button type="button" class="il-close">' +
          icono('x') + '<span class="il-lbl">' + esc(sinSimbolo(t('close'))) + '</span></button>' +
      '</div>' +
      panelAa + menuMasHTML +
    '</div>';

  const figura = iuFinal && !enCuerpo
    ? '<figure class="il-figure' + (cap || auImg ? ' il-con-pie' : '') + '"><img src="' + esc(iuFinal) + '"' +
      (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') +
      ' alt="' + esc(headline) + '" loading="lazy"><figcaption>' +
      esc(cap) + (auImg ? (cap ? ' — ' : '') + esc(auImg) : '') +
      '</figcaption></figure>'
    : '';

  const sourceBadge =
    '<span class="il-source-badge"> · ' + esc(t('sourceLabel')) + ': ' +
    esc(srcName) + ' · ' + wordsCount + ' ' + esc(t('words')) + '</span>';

  const metaActions =
    '<div class="il-meta-actions">' +
      '<button type="button" class="il-save-meta"></button>' +
      '<button type="button" class="il-img-meta"></button>' +
      '<button type="button" class="il-rsvp-meta">' + icono('zap') + '<span>' + esc(sinSimbolo(t('teleprompter'))) + '</span></button>' +
    '</div>';

  const contentHTML =
    '<div class="il-wrap"><div class="il-content" lang="' + esc(pageLang) + '">' +
      // La portada que se repite en el cuerpo: miniatura que lleva hasta ella.
      (enCuerpo && iuFinal ? '<button type="button" class="il-miniatura' + (enCuerpo.caption ? ' il-con-pie' : '') + '"' +
        ' aria-label="' + esc(t('verPortada')) + '"><img src="' + esc(iuFinal) + '"' +
        (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') + ' alt=""></button>' : '') +
      '<h1 id="il-titulo" tabindex="-1">' + esc(headline) + '</h1>' +
      (description ? '<p class="il-desc">' + esc(description) + '</p>' : '') +
      '<div class="il-meta">' + esc(fecha) +
        (articleSection ? ' · ' + esc(articleSection) : '') +
        (autores ? ' · ' + esc(autores) : '') +
      '</div>' +
      metaActions +
      figura +
      '<div class="il-body">' + renderBody() + '</div>' +
      // Final: volver a Voceiro (marcándola leída), la siguiente pendiente,
      // guardarla para luego o subir. Al llegar aquí se marca leída sola.
      '<section class="il-fin">' +
        '<div class="il-fin-acciones">' +
          '<button type="button" class="il-fin-volver il-primary">' + esc(t('finVolver')) + '</button>' +
          '<button type="button" class="il-fin-siguiente" hidden>' +
            '<span>' + esc(t('finSiguiente')) + '</span><span class="il-fin-sig-titulo"></span>' +
          '</button>' +
          '<button type="button" class="il-fin-guardar"></button>' +
          '<button type="button" class="il-fin-arriba">' + esc(t('up')) + '</button>' +
        '</div>' +
        '<p class="il-fin-estado" role="status" aria-live="polite"></p>' +
      '</section>' +
      '<div class="il-footer">' +
        '<button class="il-dict-hint">' + esc(t('raeHint')) + ' ' + esc(defaultDictName) + '</button>' +
        sourceBadge +
      '</div>' +
    '</div></div>';

  const ambi = iuFinal ? '<img id="il-ambi-img" src="' + esc(iuFinal) + '"' +
    (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') + ' alt="">' : '';

  const full = '<div id="il-full" role="dialog" aria-modal="true" aria-labelledby="il-titulo"' +
    ' data-theme="' + esc(prefs.theme) + '" data-font="' + esc(prefs.font) +
    '" data-just="' + (prefs.just ? '1' : '0') + '">' +
    '<style>' + buildReaderCSS() + '</style>' + ambi +
    '<div style="position:relative;z-index:1">' + toolbarHTML + contentHTML + '</div>' +
    '<button type="button" class="il-top-btn" aria-label="' + esc(sinSimbolo(t('up'))) + '">' + icono('arrow-up') + '</button>' +
    '</div>';

  // Lo que tenía el foco (el botón del lector, normalmente) lo recupera al
  // salir. La página de debajo queda tapada e inerte mientras (25).
  const focoAntes = document.activeElement;
  document.body.insertAdjacentHTML('beforeend', full);
  const ov = document.getElementById('il-full');
  const pagina = taparPagina(ov);

  // Imágenes: lo del medio, si tiene; si no, lo de todos los medios.
  function imagenesDelMedio(){
    const rule = findSiteRule();
    return rule && IMAGENES.includes(rule.imagenes) ? rule.imagenes : '';
  }
  function imagenesEfectivas(){
    return imagenesDelMedio() || (IMAGENES.includes(prefs.imagenes) ? prefs.imagenes : 'todas');
  }
  // Escritos tal cual: build.mjs solo mete los iconos que ve como icono('…').
  const ICONO_IMAGENES = { todas: icono('image'), conPie: icono('captions'), ninguna: icono('image-off') };
  const TEXTO_IMAGENES = { todas: 'imgTodas', conPie: 'imgConPie', ninguna: 'imgNinguna' };
  const siguienteImagenes = v => IMAGENES[(IMAGENES.indexOf(v) + 1) % IMAGENES.length];
  function pintarImagenes(){
    const v = imagenesEfectivas();
    const delMedio = imagenesDelMedio();
    ov.setAttribute('data-imagenes', v);
    const b = ov.querySelector('.il-img-meta');
    b.innerHTML = ICONO_IMAGENES[v] + '<span>' + esc(t(TEXTO_IMAGENES[v])) + '</span>';
    b.setAttribute('aria-label', t(TEXTO_IMAGENES[v]) + (delMedio ? ' (' + t('imgEnEsteMedio') + ')' : '') +
      '. ' + t('imgCambiarA') + ': ' + t(TEXTO_IMAGENES[siguienteImagenes(v)]));
    ov.querySelectorAll('input[name="il-img-medio"]').forEach(r => { r.checked = r.value === delMedio; });
  }
  // El botón y la tecla pasan al siguiente estado: el del medio si tiene
  // uno propio; si no, el de todos los medios.
  function cambiarImagenes(){
    const sig = siguienteImagenes(imagenesEfectivas());
    const delMedio = !!imagenesDelMedio();
    if (delMedio) findSiteRule().imagenes = sig; else prefs.imagenes = sig;
    applyPrefs();
    toast(t(TEXTO_IMAGENES[sig]) + (delMedio ? ' · ' + t('imgEnEsteMedio') : ''), 1400);
  }

  // Pinta las preferencias; applyPrefs, además, las guarda.
  function pintarPrefs(){
    aplicarTema(ov);
    ov.setAttribute('data-font', prefs.font);
    ov.setAttribute('data-just', prefs.just ? '1' : '0');
    ov.style.setProperty('--w', prefs.width + 'px');
    ov.style.setProperty('--fs', prefs.fs + 'px');
    ov.style.setProperty('--lh', prefs.lh);
    ov.classList.toggle('il-focus', prefs.focus);
    pintarImagenes();

    ov.querySelector('.il-fs-val').textContent = prefs.fs;
    ov.querySelector('.il-w-val').textContent = prefs.width;
    const marcar = (nombre, valor) =>
      ov.querySelectorAll('input[name="' + nombre + '"]').forEach(r => { r.checked = r.value === valor; });
    marcar('il-tema', prefs.theme);
    marcar('il-letra', prefs.font);
    marcar('il-origen', currentReaderSource());
    ov.querySelectorAll('input[name="il-pref"]').forEach(c => { c.checked = !!prefs[c.value]; });
    pintarColores();
    if (prefs.focus) setTimeout(updateFocus, 60);
  }
  function applyPrefs(){
    pintarPrefs();
    saveCfg(CFG);
  }

  // Editor del tema personalizado: se ve con ese tema y dice el contraste de
  // cada color con el fondo (aviso si baja de 4,5:1).
  function pintarColores(){
    const caja = ov.querySelector('.il-colores');
    const colores = prefs.theme === 'custom' ? limpiarColores(prefs.colores) : null;
    caja.hidden = !colores;
    const m = muestraPersonalizada();
    const lbl = ov.querySelector('input[name="il-tema"][value="custom"]').closest('.il-opcion');
    lbl.style.setProperty('--muestra-bg', m.bg);
    lbl.style.setProperty('--muestra-fg', m.fg);
    lbl.style.setProperty('--muestra-borde', m['btn-border']);
    if (!colores) return;
    CLAVES_COLORES.forEach(k => { const inp = ov.querySelector('#il-color-' + k); if (inp.value !== colores[k]) inp.value = colores[k]; });
    caja.querySelectorAll('.il-cr').forEach(sp => {
      const r = contraste(colores[sp.dataset.cr], colores.fondo);
      sp.classList.toggle('il-poco', r < 4.5);
      sp.textContent = r.toLocaleString(CFG.lang, { maximumFractionDigits: 1 }) + ':1' +
        (r < 4.5 ? ' · ⚠ ' + t('pocoContraste') : ' ✓');
    });
  }

  // La configuración ha cambiado fuera (otra pestaña, Voceiro): se toma la
  // nueva y se repinta, sin guardar (guardar aquí la volvería a mandar).
  function refrescar(){
    if (document.getElementById('il-full') !== ov){ __lectorAbierto = null; return; }
    const bionicAntes = !!prefs.bionic;
    prefs = CFG.prefs;
    if (!!prefs.bionic !== bionicAntes){
      ov.querySelector('.il-body').innerHTML = renderBody();
      wireImages();
    }
    pintarPrefs();
    pintarBotonGuardar();
    pintarSiguiente();
  }

  function updateFocus(){
    if (!prefs.focus) return;
    const els = ov.querySelectorAll('.il-body>*');
    if (!els.length) return;
    const mid = window.innerHeight / 2;
    let best = null, bd = Infinity;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bd){ bd = d; best = el; }
    });
    els.forEach(el => el.classList.toggle('il-active', el === best));
  }

  // Visor: la imagen en grande, con su pie, y ← → para recorrer todas las
  // que se ven en el artículo (sueltas y de galerías).
  function pieDe(im){
    if (im.hasAttribute('data-pie')) return im.getAttribute('data-pie');
    const fc = im.closest('figure') && im.closest('figure').querySelector('figcaption');
    return fc && !im.closest('.il-galeria') ? (fc.textContent || '').trim() : '';
  }
  function abrirVisor(desde){
    const lista = [...ov.querySelectorAll('.il-figure img, .il-inline-figure img, .il-galeria img')]
      .filter(x => x.getClientRects().length && x.style.display !== 'none');
    let i = Math.max(0, lista.indexOf(desde));
    const lb = document.createElement('div');
    lb.className = 'il-visor';
    lb.tabIndex = -1;
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    const varias = lista.length > 1;
    lb.innerHTML =
      '<img class="il-visor-img" alt="">' +
      '<p class="il-visor-pie" aria-live="polite"></p>' +
      '<button type="button" class="il-visor-cerrar" aria-label="' + esc(sinSimbolo(t('close'))) + '">' + icono('x') + '</button>' +
      (varias ? '<button type="button" class="il-visor-ant" aria-label="' + esc(t('visorAnterior')) + '">' + icono('chevron-left') + '</button>' +
                '<button type="button" class="il-visor-sig" aria-label="' + esc(t('visorSiguiente')) + '">' + icono('chevron-right') + '</button>' : '');
    const big = lb.querySelector('.il-visor-img');
    const pie = lb.querySelector('.il-visor-pie');
    function mostrar(n){
      i = (n + lista.length) % lista.length;
      const x = lista[i];
      big.src = x.currentSrc || x.src;
      big.alt = x.alt || '';
      const texto = pieDe(x);
      pie.textContent = (varias ? (i + 1) + ' / ' + lista.length + (texto ? ' · ' : '') : '') + texto;
      lb.setAttribute('aria-label', x.alt || texto || t('ampliarImagen'));
    }
    const cerrar = () => { lb.remove(); (lista[i] || desde).focus(); };
    lb.onclick = e => { if (e.target === lb || e.target === big) cerrar(); };
    lb.querySelector('.il-visor-cerrar').onclick = cerrar;
    if (varias){
      lb.querySelector('.il-visor-ant').onclick = () => mostrar(i - 1);
      lb.querySelector('.il-visor-sig').onclick = () => mostrar(i + 1);
    }
    lb.onkeydown = e => {
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cerrar(); }
      else if (varias && e.key === 'ArrowLeft'){ e.preventDefault(); e.stopPropagation(); mostrar(i - 1); }
      else if (varias && e.key === 'ArrowRight'){ e.preventDefault(); e.stopPropagation(); mostrar(i + 1); }
    };
    mostrar(i);
    ov.appendChild(lb);
    lb.focus();
  }

  function wireImages(){
    ov.querySelectorAll('.il-figure img, .il-inline-figure img, .il-galeria img, #il-ambi-img').forEach(im => {
      if (im.dataset.ilWired === '1') return;
      im.dataset.ilWired = '1';
      im.addEventListener('error', function(){
        const fb = this.getAttribute('data-fallback');
        if (fb && this.src !== fb){ this.removeAttribute('data-fallback'); this.src = fb; }
        else this.style.display = 'none';
      });
      if (im.closest('.il-figure') || im.closest('.il-inline-figure') || im.closest('.il-galeria')){
        const alt = im.getAttribute('alt') || '';
        im.tabIndex = 0;
        im.setAttribute('role', 'button');
        im.setAttribute('aria-label', (alt ? alt + ' — ' : '') + t('ampliarImagen'));
        const ampliar = () => abrirVisor(im);
        im.addEventListener('click', ampliar);
        im.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); ampliar(); }
        });
      }
    });
  }

  pintarPrefs();
  wireImages();
  // El foco entra en el lector por el título: el lector de pantalla lo lee
  // y el teclado empieza aquí.
  try { ov.querySelector('#il-titulo').focus({ preventScroll: true }); } catch(e){}



  const topBtn = ov.querySelector('.il-top-btn');
  topBtn.onclick = () => ov.scrollTo({ top: 0, behavior: desplazar() });

  let focusTimer = null, lastScroll = 0;
  const topbarEl = ov.querySelector('.il-topbar');
  ov.addEventListener('scroll', () => {
    const st = Math.max(0, ov.scrollTop);
    const sh = ov.scrollHeight - ov.clientHeight;
    ov.querySelector('.il-progress-bar').style.width = (sh > 0 ? st / sh * 100 : 0) + '%';
    topBtn.classList.toggle('il-show', st > 400);
    if (st > lastScroll && st > 80) topbarEl.classList.add('il-hidden');
    else topbarEl.classList.remove('il-hidden');
    lastScroll = st;
    if (prefs.focus && !focusTimer){
      focusTimer = setTimeout(() => { updateFocus(); focusTimer = null; }, 100);
    }
  }, { passive: true });

  function closeOverlay(){
    if (ov.__cerrarRSVP) ov.__cerrarRSVP();
    clearTimeout(focusTimer);
    document.removeEventListener('keydown', keyHandler);
    if (finObservador) finObservador.disconnect();
    __lectorAbierto = null;
    pagina.fin();
    ov.remove();
    if (focoAntes && focoAntes.isConnected){
      if (focoAntes.__enfocar) focoAntes.__enfocar();
      else if (focoAntes.focus) focoAntes.focus();
    }
    setTimeout(() => actualizarBoton(), 100);
  }

  // ── Apariencia y Más: uno abierto a la vez. Esc o pulsar fuera los
  // cierra y, con Esc, el foco vuelve a su botón. ──
  const desplegables = [
    { boton: ov.querySelector('.il-aa-btn'), caja: ov.querySelector('#il-panel-aa') },
    { boton: ov.querySelector('.il-mas-btn'), caja: ov.querySelector('#il-menu-mas'), menu: true },
  ];
  const desplegableAbierto = () => desplegables.find(d => !d.caja.hidden) || null;
  function cerrarDesplegable(devolverFoco){
    const d = desplegableAbierto();
    if (!d) return false;
    d.caja.hidden = true;
    d.boton.setAttribute('aria-expanded', 'false');
    ov.classList.remove('il-desplegado');
    if (devolverFoco) d.boton.focus();
    return true;
  }
  function abrirDesplegable(d){
    cerrarDesplegable(false);
    d.caja.hidden = false;
    d.boton.setAttribute('aria-expanded', 'true');
    ov.classList.add('il-desplegado');
    const primero = d.menu
      ? d.caja.querySelector('[role="menuitem"]')
      : (d.caja.querySelector('input:checked') || d.caja.querySelector('input, button'));
    if (primero) primero.focus();
  }
  desplegables.forEach(d => {
    d.boton.onclick = e => {
      e.stopPropagation();
      if (d.caja.hidden) abrirDesplegable(d);
      else cerrarDesplegable(true);
    };
  });
  ov.addEventListener('pointerdown', e => {
    const d = desplegableAbierto();
    if (d && !d.caja.contains(e.target) && !d.boton.contains(e.target)) cerrarDesplegable(false);
  });
  // Menú: flechas, Inicio y Fin para moverse; Tab lo cierra; elegir, también.
  const menuMas = ov.querySelector('#il-menu-mas');
  menuMas.addEventListener('keydown', e => {
    const items = [...menuMas.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    let j = null;
    if (e.key === 'ArrowDown') j = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    else if (e.key === 'Tab'){ cerrarDesplegable(false); return; }
    if (j === null) return;
    e.preventDefault();
    items[j].focus();
  });
  menuMas.addEventListener('click', e => {
    if (e.target.closest('[role="menuitem"]')) cerrarDesplegable(false);
  });

  ov.querySelectorAll('.il-close').forEach(b => b.onclick = closeOverlay);
  // Cerrar la pestaña y que quede delante Voceiro (VOLVER_KEY: la pestaña de
  // Voceiro se pone delante al enterarse). Si el navegador no deja cerrarla:
  // si ya estás en Voceiro, se sale del lector sin más; si no, esta misma
  // pestaña va a Voceiro.
  function volverAVoceiro(){
    if (PLATAFORMA.volverAVoceiro){ PLATAFORMA.volverAVoceiro(); return; }
    PLATAFORMA.guardar(VOLVER_KEY, Date.now());
    // El adaptador de extensión confirma sus escrituras antes de cerrar.
    Promise.resolve(PLATAFORMA.vaciar ? PLATAFORMA.vaciar() : null).then(() => PLATAFORMA.cerrarPestana());
    setTimeout(() => {
      if (document.visibilityState === 'hidden') closeOverlay();
      else location.href = VOCEIRO_URL;
    }, 600);
  }
  ov.querySelector('.il-voceiro-btn').onclick = volverAVoceiro;
  ov.querySelector('.il-settings-btn').onclick = (e) => { e.stopPropagation(); openSettings('sites'); };
  ov.querySelector('.il-pendientes-btn').onclick = (e) => { e.stopPropagation(); openSettings('pendientes'); };

  function copyText(txt){
    const done = () => toast('✓ ' + t('copied'), 1500);
    const fb = () => {
      const ta = document.createElement('textarea');
      ta.id = 'il-copia';   // con id il-…: la página tapada no lo tapa
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch(e){ toast(t('copyFailed')); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb);
    else fb();
  }
  ov.querySelector('.il-copytxt').onclick = () => copyText(buildText());
  ov.querySelector('.il-print').onclick = () => window.print();
  ov.querySelector('.il-fin-arriba').onclick = () => ov.scrollTo({ top: 0, behavior: desplazar() });
  ov.querySelector('.il-mail').onclick = () => {
    const txt = buildText();
    const subj = encodeURIComponent(headline || t('news'));
    if (txt.length > 1800){
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
      toast(t('articleCopied'));
      window.location.href = 'mailto:?subject=' + subj;
    } else {
      window.location.href = 'mailto:?subject=' + subj + '&body=' + encodeURIComponent(txt);
    }
  };
  ov.querySelector('.il-share').onclick = () => {
    if (navigator.share){
      navigator.share({ title: headline || document.title, text: description || '', url: articleUrl }).catch(()=>{});
    } else if (navigator.clipboard){
      navigator.clipboard.writeText(articleUrl).then(() => toast(t('urlCopied')));
    }
  };
  ov.querySelectorAll('.il-servicio').forEach(btn => {
    const svc = servicios.find(s => s.id === btn.getAttribute('data-servicio'));
    if (svc) btn.onclick = () => abrirEnServicio(svc, articleUrl);
  });

  ov.querySelector('.il-ignore-section').onclick = () => { ignoreCurrentSection(); };
  ov.querySelector('.il-rsvp-meta').onclick = () => openRSVP(ov, parrafos.filter(esDeTexto).map(textoDeBloque).join('\n\n'));
  ov.querySelector('.il-rsvp-menu').onclick = () => openRSVP(ov, parrafos.filter(esDeTexto).map(textoDeBloque).join('\n\n'));
  ov.querySelector('.il-dict-hint').onclick = () => { openSettings('dict'); };

  ov.querySelectorAll('input[name="il-tema"]').forEach(r =>
    r.onchange = () => {
      if (r.value === 'custom' && !limpiarColores(prefs.colores)) prefs.colores = coloresDelTema(prefs.theme);
      prefs.theme = r.value;
      applyPrefs();
    });
  // Al mover un color se ve al momento; al soltarlo se guarda (y viaja).
  ov.querySelectorAll('.il-colores input[type="color"]').forEach(inp => {
    inp.oninput = () => {
      prefs.colores = limpiarColores({ ...(limpiarColores(prefs.colores) || coloresDelTema('light')), [inp.dataset.color]: inp.value });
      pintarPrefs();
    };
    inp.onchange = () => applyPrefs();
  });
  ov.querySelectorAll('input[name="il-letra"]').forEach(r =>
    r.onchange = () => { prefs.font = r.value; applyPrefs(); });
  ov.querySelector('.il-fs-minus').onclick = () => { prefs.fs = Math.max(UI.fsMin, prefs.fs - 1); applyPrefs(); };
  ov.querySelector('.il-fs-plus').onclick  = () => { prefs.fs = Math.min(UI.fsMax, prefs.fs + 1); applyPrefs(); };
  ov.querySelector('.il-w-minus').onclick  = () => { prefs.width = Math.max(UI.wMin, prefs.width - UI.wStep); applyPrefs(); };
  ov.querySelector('.il-w-plus').onclick   = () => { prefs.width = Math.min(UI.wMax, prefs.width + UI.wStep); applyPrefs(); };
  ov.querySelectorAll('input[name="il-pref"]').forEach(c => c.onchange = () => {
    const p = c.value;
    prefs[p] = c.checked;
    if (p === 'bionic'){
      ov.querySelector('.il-body').innerHTML = renderBody();
      wireImages();
    }
    applyPrefs();
  });

  // Imágenes en este medio: '' quita lo del medio y vale lo de todos.
  ov.querySelectorAll('input[name="il-img-medio"]').forEach(r => r.onchange = () => {
    if (r.value) ensureSiteRule().imagenes = r.value;
    else { const rule = findSiteRule(); if (rule) delete rule.imagenes; }
    applyPrefs();
  });
  ov.querySelector('.il-img-meta').onclick = cambiarImagenes;
  const miniatura = ov.querySelector('.il-miniatura');
  if (miniatura) miniatura.onclick = () => {
    const fig = ov.querySelector('#il-portada');
    if (!fig) return;
    fig.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const im = fig.tagName === 'IMG' ? fig : fig.querySelector('img');
    if (im) im.focus({ preventScroll: true });
  };

  ov.querySelectorAll('input[name="il-origen"]').forEach(r => r.onchange = async () => {
    const v = r.value;
    if (!READER_SOURCES.includes(v)) return;
    if (v === currentReaderSource()) return;
    const labels = { auto: t('srcAuto'), jsonld: t('srcJsonld'), readability: t('srcReadability'), custom: t('srcCustom') };
    const srcLabel = labels[v] || v;
    const domain = normalizeDomain(location.hostname);
    const rule = findSiteRule();
    if (!rule){
      if (v === 'auto'){
        __sessionSourceOverride = null;
        closeOverlay();
        setTimeout(() => activateReader(), 150);
        return;
      }
      const choice = await showAddSiteDialog(domain, srcLabel, ov);
      if (choice === 'cancel'){ pintarPrefs(); return; }
      if (choice === 'add'){
        setReaderSourceForCurrentSite(v);
        toast(t('siteAddedToast').replace('{X}', domain).replace('{Y}', srcLabel), 6000,
          { label: t('btnUndo'), onClick: () => {
            if (removeSiteRule(domain)) toast(t('siteRemovedToast').replace('{X}', domain), 1800);
          } });
      } else {
        __sessionSourceOverride = v;
        toast(t('sessionOnlyToast').replace('{Y}', srcLabel), 1800);
      }
      closeOverlay();
      setTimeout(() => activateReader(), 150);
      return;
    }
    setReaderSourceForCurrentSite(v);
    toast(t('srcSiteSaved').replace('{X}', srcLabel), 1200);
    closeOverlay();
    setTimeout(() => activateReader(), 150);
  });

  ov.querySelector('.il-body').addEventListener('dblclick', e => {
    if (e.target && e.target.closest && e.target.closest('a')) return;
    const sel = window.getSelection();
    let w = (sel ? sel.toString() : '').trim();
    w = w.replace(/^[¿¡«"']+|[.!?,\-:;»"']+$/g, '');
    if (!w || w.length > 40 || /\s/.test(w)) return;
    if (CFG.dict.mode === 'popup'){ showDictPopup(w, ov); }
    else { openDictionary(defaultDict, w); }
  });
  // Sin guardar → neutro; pendiente → color de guardar; leída → verde
  // (se puede devolver a pendientes). Colores del tema, con su contraste.
  // Hay dos: arriba, junto al título, y en el final.
  function pintarBotonGuardar(){
    const ex = findLaterItem(articleUrl);
    ov.querySelectorAll('.il-save-meta, .il-fin-guardar').forEach(btn => {
      btn.classList.toggle('il-guardada', !!ex && !ex.read);
      btn.classList.toggle('il-leida', !!ex && !!ex.read);
      btn.innerHTML = (ex ? icono('bookmark-check') : icono('bookmark')) +
        '<span>' + esc(t(!ex ? 'saveLater' : ex.read ? 'saveToPending' : 'saveRemove')) + '</span>';
    });
  }

  ov.querySelectorAll('.il-save-meta, .il-fin-guardar').forEach(btn => btn.onclick = function(){
    saveForLater(art);
    // Si vuelve a pendientes, ya no cuenta como leída aquí.
    const ex = findLaterItem(articleUrl);
    if (estadoLeida === 'marcada' && ex && !ex.read){ estadoLeida = 'deshecha'; finEstado.textContent = ''; }
    pintarBotonGuardar();
    pintarSiguiente();
  });

  // ── Final del artículo ──
  // estadoLeida: 'no' (aún no), 'marcada' (se puede deshacer) o 'deshecha'
  // (la persona dijo que no: ya no se marca sola).
  let estadoLeida = 'no', deshacerLeida = null, finObservador = null;
  const finEstado = ov.querySelector('.il-fin-estado');

  function marcarLeida(){
    if (estadoLeida === 'marcada') return;
    estadoLeida = 'marcada';
    deshacerLeida = marcarLeidaAlTerminar(articleUrl);
    pintarBotonGuardar();
    pintarSiguiente();
    finEstado.textContent = '';
    const txt = document.createElement('span');
    txt.textContent = '✓ ' + t('finMarcada') + ' · ';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'il-fin-deshacer';
    btn.textContent = t('btnUndo');
    btn.onclick = () => {
      if (deshacerLeida) deshacerLeida();
      deshacerLeida = null;
      estadoLeida = 'deshecha';
      finEstado.textContent = '';
      pintarBotonGuardar();
      pintarSiguiente();
    };
    finEstado.append(txt, btn);
  }

  function pintarSiguiente(){
    const b = ov.querySelector('.il-fin-siguiente');
    const sig = siguientePendiente(articleUrl);
    b.hidden = !sig;
    if (!sig) return;
    const titulo = sig.title || sig.url;
    b.querySelector('.il-fin-sig-titulo').textContent = titulo;
    b.setAttribute('aria-label', t('finSiguienteDe').replace('{X}', titulo));
    b.onclick = () => {
      if (estadoLeida !== 'marcada') marcarLeida();
      irASiguientePendiente(sig);
    };
  }

  ov.querySelector('.il-fin-volver').onclick = () => {
    if (estadoLeida !== 'marcada') marcarLeida();
    volverAVoceiro();
  };

  // Llegar al final cuenta como leída, si se ha bajado hasta allí (un
  // artículo que cabe entero en pantalla no se marca solo).
  if ('IntersectionObserver' in window){
    finObservador = new IntersectionObserver(entradas => {
      if (estadoLeida !== 'no' || ov.scrollTop <= 0) return;
      if (entradas.some(en => en.isIntersecting)) marcarLeida();
    }, { root: ov, threshold: 0.5 });
    finObservador.observe(ov.querySelector('.il-fin-acciones'));
  }

  // Estado inicial al abrir el lector
  pintarBotonGuardar();
  pintarSiguiente();
  __lectorAbierto = { refrescar, cerrar: closeOverlay };

  function showDictPopup(word, parentEl){
    const existing = parentEl.querySelector('.il-dict-popup');
    if (existing) existing.remove();
    const dicts = getDictsForLang(pageLang);
    if (!dicts.length){ toast(t('dictNoDefault')); return; }
    const pop = document.createElement('div');
    pop.className = 'il-dict-popup';
    const title = document.createElement('div');
    title.className = 'il-dict-popup-title';
    title.textContent = t('dictSearchIn') + ' "' + word + '"';
    pop.appendChild(title);
    dicts.forEach(d => {
      const btn = document.createElement('button');
      btn.textContent = d.name;
      btn.onclick = () => { openDictionary(d, word); pop.remove(); };
      pop.appendChild(btn);
    });
    const sel = window.getSelection();
    if (sel && sel.rangeCount){
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 220, rect.left + rect.width/2 - 90)) + 'px';
      pop.style.top = Math.max(8, Math.min(window.innerHeight - 220, rect.bottom + 8)) + 'px';
    } else {
      pop.style.left = '50%'; pop.style.top = '50%';
    }
    parentEl.appendChild(pop);
    const dismiss = e => {
      if (!pop.contains(e.target)){ pop.remove(); document.removeEventListener('mousedown', dismiss); }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
  }

  function executeReaderAction(action){
    switch (action){
      case 'fontIncrease': prefs.fs = Math.min(UI.fsMax, prefs.fs + 1); applyPrefs(); break;
      case 'fontDecrease': prefs.fs = Math.max(UI.fsMin, prefs.fs - 1); applyPrefs(); break;
      case 'toggleTheme':  prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; applyPrefs(); break;
      case 'scrollTop':    ov.scrollTo({ top: 0, behavior: desplazar() }); break;
      case 'scrollBottom': ov.scrollTo({ top: ov.scrollHeight, behavior: desplazar() }); break;
      case 'toggleBionic':
        prefs.bionic = !prefs.bionic;
        ov.querySelector('.il-body').innerHTML = renderBody();
        wireImages();
        applyPrefs();
        break;
      case 'toggleFocus':   prefs.focus = !prefs.focus; applyPrefs(); break;
      case 'toggleJustify': prefs.just  = !prefs.just;  applyPrefs(); break;
      case 'toggleImages':  cambiarImagenes(); break;
      case 'toggleWide':    prefs.width = prefs.width >= 900 ? 720 : 1100; applyPrefs(); break;
      case 'saveLater':     saveForLater(art); pintarBotonGuardar(); pintarSiguiente(); break;
      case 'openSites':     openSettings('sites'); break;
      case 'openQueue':     openSettings('pendientes'); break;
      case 'openRSVP':      openRSVP(ov, parrafos.filter(esDeTexto).map(textoDeBloque).join('\n\n')); break;
      case 'copyText':
        copyText(buildText());
        break;
    }
  }

  function keyHandler(e){
    if (!e.isTrusted || ov.querySelector('#il-rsvp-root')) return;
    if (!document.getElementById('il-full')) return;
    if (document.getElementById('il-settings')) return;
    if (document.getElementById('il-extract-tool')) return;
    if (isPickerActive()) return;
    if (document.querySelector('#il-full .il-visor')) return;   // el visor lleva sus teclas
    const nk = normalizeKey(e);
    // Esc cierra primero Apariencia o Más, también desde sus casillas.
    if (nk === 'escape' && cerrarDesplegable(true)){ e.preventDefault(); return; }
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;

    if (nk === 'escape'){ closeOverlay(); return; }

    const action = findActionByKey('reader', nk);
    if (!action) return;
    e.preventDefault();
    executeReaderAction(action);
  }
  document.addEventListener('keydown', keyHandler);
}

