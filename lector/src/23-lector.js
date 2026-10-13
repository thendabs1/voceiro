/* ============================================================
   19. LECTOR
   ============================================================ */
function openReader(art){
  if (document.getElementById('il-full')) return;

  const prefs = CFG.prefs;
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

  const parrafos = useHTML ? buildBlocksFromHTML(rawHTML) : buildBlocksFromText(rawBody);
  const srcKey = art._source || (rawHTML ? 'readability' : 'jsonld');
  const srcName = srcKey === 'jsonld' ? t('srcJsonld')
                : srcKey === 'custom' ? t('srcCustom')
                : srcKey === 'all' ? t('extractionModeAll')
                : t('srcReadability');
  const wordsCount = countWords(plainBody);

  const iu = String(art.image || '');
  const iuHi = iu.replace('_16-9-discover-', '_source-');
  const iuFinal = iuHi !== iu ? iuHi : iu;
  const iuFallback = iuHi !== iu ? iu : '';
  const cap = art.imageCaption || '';
  const auImg = art.imageAuthor || '';

  function renderBlock(b){
    const process = html => prefs.bionic ? bionicizeHTML(html) : html;
    if (b.tipo === 'img'){
      return '<figure class="il-inline-figure">' +
        '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || '') + '" loading="lazy">' +
        (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') +
      '</figure>';
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
      lines + '\n\nURL: ' + location.href;
  }

  // «Abrir en…»: los servicios que haya configurado cada persona.
  const servicios = serviciosConfigurados();
  const serviciosHTML = servicios.map(svc =>
    '<button class="il-servicio" data-servicio="' + esc(svc.id) + '">' + esc(svc.nombre) + '</button>'
  ).join('');

  const progressHTML =
    '<div class="il-progress"><div class="il-progress-bar"></div></div>';

  const toolbarHTML =
    progressHTML +
    '<div class="il-topbar">' +
      '<div class="il-nav-row">' +
        '<button class="il-back il-primary">' + esc(t('back')) + '</button>' +
        '<button class="il-voceiro-btn il-primary">' + esc(t('btnTitulares')) + '</button>' +
        '<button class="il-toggle-text">' + esc(t('options')) + '</button>' +
        '<button class="il-toggle-actions">' + esc(t('actions')) + '</button>' +
        '<button class="il-textonly-btn" title="' + esc(t('textOnlyShort')) + '">🖼</button>' +
        '<button class="il-pendientes-btn" title="' + esc(t('pendientesShort')) + '">📚</button>' +
        (servicios.length
          ? '<button class="il-servicios-btn" title="' + esc(t('abrirEn')) + '" aria-label="' + esc(t('abrirEn')) + '">↗</button>'
          : '') +
        '<button class="il-settings-btn" title="' + esc(t('settingsShort')) + '">⚙️</button>' +
        '<button class="il-close-tab" title="' + esc(t('closeTab')) + '">✕</button>' +
        '<button class="il-close il-primary">' + esc(t('close')) + '</button>' +
      '</div>' +
      '<div class="il-settings-bar" id="il-panel-text" style="display:none">' +
        '<div class="il-group"><label>' + esc(t('theme')) + '</label>' +
          '<button data-set-theme="light" title="' + esc(t('light')) + '">☀</button>' +
          '<button data-set-theme="sepia" title="' + esc(t('sepia')) + '">📖</button>' +
          '<button data-set-theme="dark" title="' + esc(t('dark')) + '">🌙</button>' +
          '<button data-set-theme="contrast" title="' + esc(t('contrast')) + '">◐</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('font')) + '</label>' +
          '<button data-set-font="georgia">' + esc(t('serif')) + '</button>' +
          '<button data-set-font="sans">' + esc(t('sans')) + '</button>' +
          '<button data-set-font="dyslexic">' + esc(t('dyslexic')) + '</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('size')) + '</label>' +
          '<button class="il-fs-minus">A−</button>' +
          '<span class="il-fs-val" style="font-weight:bold;margin:0 4px">' + prefs.fs + '</span>' +
          '<button class="il-fs-plus">A+</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('width')) + '</label>' +
          '<button class="il-w-minus">−</button>' +
          '<span class="il-w-val" style="font-weight:bold;margin:0 4px">' + prefs.width + '</span>' +
          '<button class="il-w-plus">+</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('extra')) + '</label>' +
          '<button class="il-toggle" data-pref="just">' + esc(t('justify')) + '</button>' +
          '<button class="il-toggle" data-pref="bionic">' + esc(t('bionic')) + '</button>' +
          '<button class="il-toggle" data-pref="focus">' + esc(t('focus')) + '</button>' +
          '<button class="il-toggle" data-pref="img" title="' + esc(t('coverImageTitle')) + '">' + esc(t('coverImage')) + '</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('source')) + '</label>' +
          '<button class="il-source" data-src="auto">' + esc(t('srcAuto')) + '</button>' +
          '<button class="il-source" data-src="jsonld">' + esc(t('srcJsonld')) + '</button>' +
          '<button class="il-source" data-src="readability">' + esc(t('srcReadability')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="il-settings-bar" id="il-panel-actions" style="display:none;background:var(--quote-bg)">' +
        serviciosHTML +
        '<button class="il-copytxt">' + esc(t('copyText')) + '</button>' +
        '<button class="il-print">' + esc(t('print')) + '</button>' +
        '<button class="il-mail">' + esc(t('email')) + '</button>' +
        '<button class="il-share">' + esc(t('share')) + '</button>' +
        '<button class="il-ignore-section">' + esc(t('ignoreSection')) + '</button>' +
      '</div>' +
    '</div>';

  const figura = iuFinal
    ? '<figure class="il-figure"><img src="' + esc(iuFinal) + '"' +
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
      '<button class="il-save-meta" title="' + esc(t('saveLater')) + '">🕒 ' + esc(t('saveLater')) + '</button>' +
      '<button class="il-rsvp-meta" title="' + esc(t('teleprompter')) + '">' + esc(t('teleprompter')) + '</button>' +
    '</div>';

  const contentHTML =
    '<div class="il-wrap"><div class="il-content">' +
      '<h1>' + esc(headline) + '</h1>' +
      (description ? '<p class="il-desc">' + esc(description) + '</p>' : '') +
      '<div class="il-meta">' + esc(fecha) +
        (articleSection ? ' · ' + esc(articleSection) : '') +
        (autores ? ' · ' + esc(autores) : '') +
      '</div>' +
      metaActions +
      figura +
      '<div class="il-body">' + renderBody() + '</div>' +
      '<div class="il-footer">' +
        '<button class="il-footer-top">' + esc(t('up')) + '</button> · ' +
        '<button class="il-footer-back">' + esc(t('back')) + '</button> · ' +
        '<button class="il-dict-hint">' + esc(t('raeHint')) + ' ' + esc(defaultDictName) + '</button>' +
        sourceBadge +
      '</div>' +
    '</div></div>';

  const ambi = iuFinal ? '<img id="il-ambi-img" src="' + esc(iuFinal) + '"' +
    (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') + ' alt="">' : '';

  const full = '<div id="il-full" data-theme="' + prefs.theme + '" data-font="' + prefs.font +
    '" data-just="' + (prefs.just ? '1' : '0') + '">' +
    '<style>' + buildReaderCSS() + '</style>' + ambi +
    '<div style="position:relative;z-index:1">' + toolbarHTML + contentHTML + '</div>' +
    '<button class="il-top-btn" title="' + esc(t('up')) + '">↑</button>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', full);
  const ov = document.getElementById('il-full');

  function currentSiteTextOnly(){
    const rule = findSiteRule();
    return !!(rule && rule.textOnly);
  }

  function applyPrefs(){
    ov.setAttribute('data-theme', prefs.theme);
    ov.setAttribute('data-font', prefs.font);
    ov.setAttribute('data-just', prefs.just ? '1' : '0');
    ov.style.setProperty('--w', prefs.width + 'px');
    ov.style.setProperty('--fs', prefs.fs + 'px');
    ov.style.setProperty('--lh', prefs.lh);
    ov.classList.toggle('il-hideimg', !prefs.img);
    ov.classList.toggle('il-focus', prefs.focus);
    const siteTextOnly = currentSiteTextOnly();
    ov.classList.toggle('il-textonly', siteTextOnly);

    const toBtn = ov.querySelector('.il-textonly-btn');
    if (toBtn){
      toBtn.textContent = siteTextOnly ? '📝' : '🖼';
      toBtn.title = siteTextOnly ? t('textOnlyOn') : t('textOnlyOff');
      toBtn.classList.toggle('il-active', siteTextOnly);
    }

    ov.querySelector('.il-fs-val').textContent = prefs.fs;
    ov.querySelector('.il-w-val').textContent = prefs.width;
    ov.querySelectorAll('[data-set-theme]').forEach(b =>
      b.classList.toggle('il-active', b.getAttribute('data-set-theme') === prefs.theme));
    ov.querySelectorAll('[data-set-font]').forEach(b =>
      b.classList.toggle('il-active', b.getAttribute('data-set-font') === prefs.font));
    ov.querySelectorAll('.il-toggle').forEach(b =>
      b.classList.toggle('il-active', !!prefs[b.getAttribute('data-pref')]));
    const srcCurrent = currentReaderSource();
    ov.querySelectorAll('.il-source').forEach(b =>
      b.classList.toggle('il-active', b.getAttribute('data-src') === srcCurrent));
    const pText = ov.querySelector('#il-panel-text');
    const pAct = ov.querySelector('#il-panel-actions');
    const bText = ov.querySelector('.il-toggle-text');
    const bAct = ov.querySelector('.il-toggle-actions');
    pText.style.display = prefs.panelText ? 'flex' : 'none';
    pAct.style.display = prefs.panelActions ? 'flex' : 'none';
    bText.classList.toggle('il-active', prefs.panelText);
    bAct.classList.toggle('il-active', prefs.panelActions);
    saveCfg(CFG);
    if (prefs.focus) setTimeout(updateFocus, 60);
  }

  function saveScroll(){
    try {
      const s = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}');
      s[location.href] = ov.scrollTop;
      const ks = Object.keys(s);
      if (ks.length > 50) for (let i = 0; i < ks.length - 50; i++) delete s[ks[i]];
      localStorage.setItem(SCROLL_KEY, JSON.stringify(s));
    } catch(e){}
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

  function wireImages(){
    ov.querySelectorAll('.il-figure img, .il-inline-figure img, #il-ambi-img').forEach(im => {
      if (im.dataset.ilWired === '1') return;
      im.dataset.ilWired = '1';
      im.addEventListener('error', function(){
        const fb = this.getAttribute('data-fallback');
        if (fb && this.src !== fb){ this.removeAttribute('data-fallback'); this.src = fb; }
        else this.style.display = 'none';
      });
      if (im.closest('.il-figure') || im.closest('.il-inline-figure')){
        im.addEventListener('click', function(){
          const lb = document.createElement('div');
          lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:30;' +
            'display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
          const big = document.createElement('img');
          big.src = this.src;
          big.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
          lb.appendChild(big);
          lb.onclick = () => lb.remove();
          ov.appendChild(lb);
        });
      }
    });
  }

  applyPrefs();
  wireImages();



  const topBtn = ov.querySelector('.il-top-btn');
  topBtn.onclick = () => ov.scrollTo({ top: 0, behavior: 'smooth' });

  let stm, focusTimer = null, lastScroll = 0;
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
    clearTimeout(stm); stm = setTimeout(saveScroll, 400);
  }, { passive: true });

  setTimeout(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}');
      if (s[location.href] && s[location.href] > 50) ov.scrollTop = s[location.href];
    } catch(e){}
  }, 350);

  function closeOverlay(){
    saveScroll();
    document.removeEventListener('keydown', keyHandler);
    ov.remove();
    setTimeout(() => ensureReaderFAB(), 100);
  }

  function goBack(){
    saveScroll();
    const before = location.href;
    if (history.length > 1){
      history.back();
      setTimeout(() => {
        if (location.href === before && document.getElementById('il-full')) closeOverlay();
      }, 250);
    } else {
      closeOverlay();
    }
  }

  const bText = ov.querySelector('.il-toggle-text');
  const bAct = ov.querySelector('.il-toggle-actions');
  bText.onclick = function(e){
    e.stopPropagation();
    prefs.panelText = !prefs.panelText;
    prefs.panelActions = false;
    applyPrefs();
  };
  bAct.onclick = function(e){
    e.stopPropagation();
    prefs.panelActions = !prefs.panelActions;
    prefs.panelText = false;
    applyPrefs();
  };
  ov.querySelector('.il-wrap').addEventListener('click', e => {
    if (!(e.ctrlKey || e.metaKey)){
      prefs.panelActions = false;
      applyPrefs();
    }
  });

  ov.querySelectorAll('.il-close').forEach(b => b.onclick = closeOverlay);
  ov.querySelector('.il-close-tab').onclick = () => {
    // 1. Intentar cerrar la pestaña
    try { window.close(); } catch(e){}
    // 2. Si en 200 ms sigue abierta, volver a Voceiro
    setTimeout(() => {
      if (!window.closed){
        location.href = VOCEIRO_URL;
      }
    }, 200);
  };
  ov.querySelectorAll('.il-back').forEach(b => b.onclick = goBack);
  ov.querySelector('.il-settings-btn').onclick = (e) => { e.stopPropagation(); openSettings('sites'); };
  ov.querySelector('.il-pendientes-btn').onclick = (e) => { e.stopPropagation(); openSettings('pendientes'); };
  ov.querySelector('.il-voceiro-btn').onclick = (e) => {
    e.stopPropagation();
    window.open(VOCEIRO_URL, '_blank', 'noopener,noreferrer');
  };

  ov.querySelector('.il-textonly-btn').onclick = (e) => {
    e.stopPropagation();
    const rule = ensureSiteRule();
    rule.textOnly = !rule.textOnly;
    saveCfg(CFG);
    applyPrefs();
    toast(rule.textOnly ? t('textOnlyOn') : t('textOnlyOff'), 1500);
  };

  function copyText(txt, btn, label){
    const orig = btn.textContent;
    const done = () => { btn.textContent = '✅ ' + label; setTimeout(() => btn.textContent = orig, 1500); };
    const fb = () => {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch(e){ toast(t('copyFailed')); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb);
    else fb();
  }
  ov.querySelector('.il-copytxt').onclick = function(){ copyText(buildText(), this, t('copied')); };
  ov.querySelector('.il-print').onclick = () => window.print();
  ov.querySelector('.il-footer-top').onclick = () => ov.scrollTo({ top: 0, behavior: 'smooth' });
  ov.querySelector('.il-footer-back').onclick = goBack;
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
      navigator.share({ title: headline || document.title, text: description || '', url: location.href }).catch(()=>{});
    } else if (navigator.clipboard){
      navigator.clipboard.writeText(location.href).then(() => toast(t('urlCopied')));
    }
  };
  ov.querySelectorAll('.il-servicio').forEach(btn => {
    const svc = servicios.find(s => s.id === btn.getAttribute('data-servicio'));
    if (svc) btn.onclick = () => abrirEnServicio(svc);
  });

  const btnServicios = ov.querySelector('.il-servicios-btn');
  if (btnServicios) btnServicios.onclick = (e) => {
    e.stopPropagation();
    const existing = ov.querySelector('.il-servicios-dropdown');
    if (existing){ existing.remove(); return; }
    const dd = crearDesplegableServicios({ position: 'fixed-top-right', onClose: () => dd.remove() });
    ov.appendChild(dd);
    setTimeout(() => {
      const close = (ev) => {
        if (!dd.contains(ev.target)){
          dd.remove();
          document.removeEventListener('mousedown', close);
        }
      };
      document.addEventListener('mousedown', close);
    }, 0);
  };

  ov.querySelector('.il-ignore-section').onclick = () => { ignoreCurrentSection(); };
  ov.querySelector('.il-rsvp-meta').onclick = () => openRSVP(ov, rawBody);
  ov.querySelector('.il-dict-hint').onclick = () => { openSettings('dict'); };

  ov.querySelectorAll('[data-set-theme]').forEach(b =>
    b.onclick = () => { prefs.theme = b.getAttribute('data-set-theme'); applyPrefs(); });
  ov.querySelectorAll('[data-set-font]').forEach(b =>
    b.onclick = () => { prefs.font = b.getAttribute('data-set-font'); applyPrefs(); });
  ov.querySelector('.il-fs-minus').onclick = () => { prefs.fs = Math.max(UI.fsMin, prefs.fs - 1); applyPrefs(); };
  ov.querySelector('.il-fs-plus').onclick  = () => { prefs.fs = Math.min(UI.fsMax, prefs.fs + 1); applyPrefs(); };
  ov.querySelector('.il-w-minus').onclick  = () => { prefs.width = Math.max(UI.wMin, prefs.width - UI.wStep); applyPrefs(); };
  ov.querySelector('.il-w-plus').onclick   = () => { prefs.width = Math.min(UI.wMax, prefs.width + UI.wStep); applyPrefs(); };
  ov.querySelectorAll('.il-toggle').forEach(b => b.onclick = () => {
    const p = b.getAttribute('data-pref');
    prefs[p] = !prefs[p];
    if (p === 'bionic'){
      ov.querySelector('.il-body').innerHTML = renderBody();
      wireImages();
    }
    applyPrefs();
  });

  ov.querySelectorAll('.il-source').forEach(b => b.onclick = async () => {
    const v = b.getAttribute('data-src');
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
      if (choice === 'cancel') return;
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
    function pintarBotonGuardar(){
    const btn = ov.querySelector('.il-save-meta');
    if (!btn) return;
    const ex = findLaterItem(location.href);
    if (!ex){
      // No está → neutro
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.textContent = '🕒 ' + t('saveLater');
    } else if (ex.read){
      // Leída → verde (puedes volver a pendientes)
      btn.style.background = '#0a7d00';
      btn.style.color = '#fff';
      btn.style.borderColor = '#0a7d00';
      btn.textContent = '🕒 ' + t('saveToPending');
    } else {
      // Pendiente → naranja (ya está en cola)
      btn.style.background = '#e67e22';
      btn.style.color = '#fff';
      btn.style.borderColor = '#e67e22';
      btn.textContent = '🕒 ' + t('saveRemove');
    }
  }

  ov.querySelector('.il-save-meta').onclick = function(){
    saveForLater(art);
    pintarBotonGuardar();
  };

  // Estado inicial al abrir el lector
  pintarBotonGuardar();

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
      case 'scrollTop':    ov.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'scrollBottom': ov.scrollTo({ top: ov.scrollHeight, behavior: 'smooth' }); break;
      case 'toggleBionic':
        prefs.bionic = !prefs.bionic;
        ov.querySelector('.il-body').innerHTML = renderBody();
        wireImages();
        applyPrefs();
        break;
      case 'toggleFocus':   prefs.focus = !prefs.focus; applyPrefs(); break;
      case 'toggleJustify': prefs.just  = !prefs.just;  applyPrefs(); break;
      case 'toggleImages':  prefs.img   = !prefs.img;   applyPrefs(); break;
      case 'toggleWide':    prefs.width = prefs.width >= 900 ? 720 : 1100; applyPrefs(); break;
      case 'saveLater':     saveForLater(art); break;
      case 'openSites':     openSettings('sites'); break;
      case 'openQueue':     openSettings('pendientes'); break;
      case 'openRSVP':      openRSVP(ov, rawBody); break;
      case 'copyText':
        copyText(buildText(), ov.querySelector('.il-copytxt'), t('copied'));
        break;
    }
  }

  function keyHandler(e){
    if (!document.getElementById('il-full')) return;
    if (document.getElementById('il-settings')) return;
    if (document.getElementById('il-extract-tool')) return;
    if (isPickerActive()) return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;

    const nk = normalizeKey(e);
    if (nk === 'escape'){ closeOverlay(); return; }

    const action = findActionByKey('reader', nk);
    if (!action) return;
    e.preventDefault();
    executeReaderAction(action);
  }
  document.addEventListener('keydown', keyHandler);
}

