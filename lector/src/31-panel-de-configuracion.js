/* ============================================================
   24. PANEL DE CONFIGURACIÓN
   ============================================================ */
// opts.dentro: un elemento de la página donde pintar el panel, sin fondo ni
// diálogo (la página Lector de Ajustes de Voceiro, que lo abre y lo cierra).
// opts.dominio: el medio que se enseña en Medios en lugar del de la página
// («Cómo leerlo», desde un titular de Voceiro).
function openSettings(initialTab, opts){
  const dentro = opts && opts.dentro;
  if (dentro ? dentro.querySelector('.il-settings-dentro') : document.getElementById('il-settings')) return;
  // Con el tema del perfil; diálogo modal: el foco entra y, al cerrar,
  // vuelve a donde estaba.
  const focoAntes = document.activeElement;
  const root = temaDe(document.createElement('div'));
  const box = document.createElement('div');
  if (dentro){
    root.classList.add('il-settings-dentro');
    root.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    box.style.cssText = 'background:var(--bg);color:var(--fg)';
  } else {
    root.id = 'il-settings';
    root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', t('settingsShort'));
    box.tabIndex = -1;
    box.style.cssText = 'background:var(--bg);color:var(--fg);border-radius:12px;max-width:960px;width:100%;' +
      'max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:24px';
  }
  root.appendChild(box);
  (dentro || document.body).appendChild(root);

  // «catalog» era la pestaña del catálogo, que ya no existe.
  let activeSection = initialTab && initialTab !== 'catalog' ? initialTab : 'sites';
  let searchQuery = '';
  let filterLang = '';
  const dominioPedido = opts && opts.dominio ? normalizeDomain(opts.dominio) : '';
  const scState = { capture: null };
  let scListener = null;

  const closeSettings = function(){
    if (scListener){
      document.removeEventListener('keydown', scListener, true);
      scListener = null;
    }
    scState.capture = null;
    root.remove();
    document.removeEventListener('keydown', escHandler, true);
    if (dentro) return;
    if (focoAntes && focoAntes.isConnected){
      if (focoAntes.__enfocar) focoAntes.__enfocar();
      else if (focoAntes.focus) focoAntes.focus();
    }
  };
  const escHandler = e => {
    if (e.key === 'Escape'){
      if (scState.capture) return;
      const tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeSettings();
    }
  };
  // Dentro de Voceiro, Esc y el cierre son cosa de su página de Ajustes.
  if (!dentro){
    document.addEventListener('keydown', escHandler, true);
    root.addEventListener('click', e => { if (e.target === root) closeSettings(); });
  }

  function dictRow(d, lang, isDefault, isBuiltin){
    const canDelete = !isBuiltin;
    return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<div style="flex:1;font-size:13px">' + esc(d.name) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.url) + '</div>' +
      '<input type="radio" name="def-' + lang + '" value="' + esc(d.id) + '"' + (isDefault ? ' checked' : '') +
        ' data-lang="' + lang + '" class="il-dict-setdef" style="cursor:pointer" title="Predeterminado">' +
      (canDelete ? '<button data-lang="' + lang + '" data-id="' + esc(d.id) + '" class="il-dict-del" ' +
        'style="border:none;background:transparent;cursor:pointer;color:var(--block);font-size:12px;padding:2px 6px">🗑</button>' : '') +
    '</div>';
  }

  function tabBtn(id, label){
    return '<button class="il-set-tab" data-tab="' + id + '" style="padding:8px 16px;border:none;' +
      'border-bottom:2px solid ' + (activeSection === id ? 'var(--accent)' : 'transparent') + ';' +
      'background:transparent;cursor:pointer;font-weight:bold;color:' +
      (activeSection === id ? 'var(--accent)' : 'var(--muted)') + '">' + esc(label) + '</button>';
  }

  function extractionBadge(ex){
    if (!ex || ex.mode === 'auto') return '';
    const label = ex.mode === 'selector' ? '🎯' : ex.mode === 'all' ? '📄' : '';
    const title = ex.mode === 'selector' ? ('Selector: ' + (ex.root || '—'))
                : ex.mode === 'all' ? 'Todo el texto'
                : '';
    return ' · <span style="color:var(--preset);font-weight:bold" title="' + esc(title) + '">' + label + '</span>';
  }

  function langLabel(lang){
    if (lang === 'auto') return t('langAuto');
    const key = 'lang' + lang.charAt(0).toUpperCase() + lang.slice(1);
    return t(key) || lang;
  }

  function renderSitesTab(){
    const currentDomain = dominioPedido || (dentro ? '' : normalizeDomain(location.hostname));
    const currentDomainInList = currentDomain && CFG.sites.some(s => s.domain === currentDomain);

    const sitesFiltered = CFG.sites.filter(s => {
      if (searchQuery && !s.domain.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterLang && s.lang !== filterLang) return false;
      return true;
    });

    const siteRows = sitesFiltered.map((s) => {
      const realIdx = CFG.sites.indexOf(s);
      const pats = (s.ignorePatterns || []).map((p, pi) =>
        '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--quote-bg);' +
          'border-radius:12px;padding:2px 4px 2px 10px;font-family:monospace;font-size:11px;margin:2px 4px 2px 0">' +
          esc(p) +
          '<button data-idx="' + realIdx + '" data-pi="' + pi + '" class="il-set-delpat" ' +
            'style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:0 4px;color:var(--block)">✕</button>' +
        '</span>').join('');
      const patBlock = '<div style="margin-top:4px;font-size:11px;color:var(--muted)">' +
        '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('ignoredSections')) + ':</span> ' +
        (pats || '<span style="color:var(--muted)">' + esc(t('noIgnoredSections')) + '</span>') +
      '</div>';
      const textOnlyBadge = s.imagenes === 'ninguna' ? ' · <span style="color:var(--accent);font-weight:bold" title="' + esc(t('imgNinguna')) + '">📝</span>'
                          : s.imagenes === 'conPie' ? ' · <span style="color:var(--accent)" title="' + esc(t('imgConPie')) + '">🖼✎</span>' : '';
      const exBadge = extractionBadge(s.extraction);
      return '<div class="il-site-row" data-idx="' + realIdx + '" data-domain="' + esc(s.domain) + '" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:140px;font-family:monospace;font-size:13px">' + esc(s.domain) + '</div>' +
          '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px">' + esc(t('siteOpening')) +
          '<select data-idx="' + realIdx + '" class="il-set-mode" style="padding:6px 10px;border:1px solid var(--btn-border);border-radius:6px;font-size:13px">' +
            '<option value="off"'    + (s.mode==='off'   ?' selected':'') + '>' + esc(t('modeOff'))    + '</option>' +
            '<option value="prompt"' + (s.mode==='prompt'?' selected':'') + '>' + esc(t('modePrompt')) + '</option>' +
            '<option value="auto"'   + (s.mode==='auto'  ?' selected':'') + '>' + esc(t('modeAuto'))   + '</option>' +
          '</select></label>' +
          '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px">' + esc(t('colLang')) +
          '<select data-idx="' + realIdx + '" class="il-set-lang" style="padding:6px 8px;border:1px solid var(--btn-border);border-radius:6px;font-size:12px">' +
            SITE_LANGS.map(l => '<option value="' + l + '"' + (s.lang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('') +
          '</select></label>' +
          '<button data-idx="' + realIdx + '" class="il-set-visit" title="' + esc(t('openSite')) + '" ' +
            'style="padding:6px 10px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">🔗</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-del" title="' + esc(t('siteDisableHint')) + '" aria-label="' + esc(t('siteDisable') + ': ' + s.domain) + '" style="padding:6px 10px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('siteDisable')) + '</button>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:11px;color:var(--muted)">' +
          '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colLang')) + ':</span> ' + esc(langLabel(s.lang)) +
          textOnlyBadge + exBadge +
        '</div>' +
        '<details style="margin-top:8px">' +
          '<summary style="cursor:pointer;font-size:13px">' + esc(t('siteAdvanced')) + '</summary>' +
          '<p style="font-size:12px;color:var(--muted)">' + esc(t('siteSourceHint')) + '</p>' +
          '<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">' +
          '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px">' + esc(t('source')) +
          '<select data-idx="' + realIdx + '" class="il-set-src" style="padding:6px 8px;border:1px solid var(--btn-border);border-radius:6px;font-size:12px">' +
            '<option value="auto"' + (s.readerSource==='auto'?' selected':'') + '>' + esc(t('srcAuto')) + '</option>' +
            '<option value="jsonld"' + (s.readerSource==='jsonld'?' selected':'') + '>' + esc(t('srcJsonld')) + '</option>' +
            '<option value="readability"' + (s.readerSource==='readability'?' selected':'') + '>' + esc(t('srcReadability')) + '</option>' +
          '</select></label>' +
          '<button data-idx="' + realIdx + '" class="il-set-extract" title="' + esc(t('extractionTitle')) + '" ' +
            'style="padding:6px 10px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">🔬 ' + esc(t('extractionTitle')) + '</button>' +
          '</div>' +
          '<p style="font-size:12px;color:var(--muted)">' + esc(t('extractionWrongSite').replace('{X}', s.domain)) + '</p>' +
        '</details>' +
        patBlock +
      '</div>';
    }).join('');

    const langFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterLang')) + '</option>' +
      SITE_LANGS.map(l => '<option value="' + l + '"' + (filterLang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('');
    // Bloqueados: los medios que se han quitado de la lista (o desactivado);
    // en ellos no sale el botón. Aquí se desbloquean.
    const bloqueados = (CFG.disabledDomains || []).slice().sort();
    const bloqueadosHTML = bloqueados.length
      ? '<div style="margin:0 0 18px;font-size:12px;color:var(--muted)">' +
          '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('blocked')) + ':</span> ' +
          bloqueados.map(d =>
            '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--quote-bg);border-radius:12px;' +
              'padding:2px 4px 2px 10px;font-family:monospace;font-size:12px;margin:2px 4px 2px 0">' + esc(d) +
              '<button class="il-set-unblock" data-d="' + esc(d) + '" aria-label="' + esc(t('unblock') + ' ' + d) + '" ' +
                'style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:2px 6px;color:var(--accent)">' + esc(t('unblock')) + '</button>' +
            '</span>').join('') +
        '</div>'
      : '';

    const addCurrentBanner = currentDomain && !currentDomainInList
      ? '<div style="background:var(--preset-bg);border:1px solid var(--preset);border-radius:8px;padding:10px 14px;' +
          'margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap">' +
          '<span style="flex:1;min-width:140px">📍 ' + esc(dominioPedido ? t('medioSinReglas') : t('currentSiteHint')) + ': <strong style="font-family:monospace">' + esc(currentDomain) + '</strong></span>' +
          '<button class="il-set-add-current" style="padding:6px 14px;background:var(--preset);color:var(--on-solid);border:none;' +
            'border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;white-space:nowrap">+ ' + esc(t('addCurrentShort')) + '</button>' +
        '</div>'
      : '';

    const html =
      '<p style="margin:0 0 12px;font-size:13px;color:var(--muted)">' + esc(t('sitesHint')) + '</p>' +
      '<p style="margin:0 0 12px;font-size:12px;color:var(--muted)">' + esc(t('siteOpeningHint')) + '</p>' +
      addCurrentBanner +
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">' +
        '<input class="il-set-search" placeholder="' + esc(t('searchPlaceholder')) + '" value="' + esc(searchQuery) + '" ' +
          'style="flex:1;min-width:140px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<select class="il-filter-lang" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' + langFilterOpts + '</select>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:340px;overflow:auto">' +
          (siteRows || '<div style="color:var(--muted);padding:8px 0;font-size:13px">' + esc(t('noSites')) + '</div>') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">' +
        '<input class="il-set-domain" placeholder="' + esc(t('domainPh')) + '" style="flex:1;min-width:180px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<select class="il-set-newmode" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
          '<option value="prompt" selected>' + esc(t('modePrompt')) + '</option>' +
          '<option value="auto">' + esc(t('modeAuto')) + '</option>' +
          '<option value="off">' + esc(t('modeOff')) + '</option>' +
        '</select>' +
        '<button class="il-set-add" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
      '</div>' +
      bloqueadosHTML;

    function wire(){
      const searchInput = box.querySelector('.il-set-search');
      if (searchInput){
        searchInput.oninput = e => {
          const pos = e.target.selectionStart;
          searchQuery = e.target.value;
          render();
          const ni = box.querySelector('.il-set-search');
          if (ni){ ni.focus(); ni.setSelectionRange(pos, pos); }
        };
      }
      const langSel = box.querySelector('.il-filter-lang');
      if (langSel) langSel.onchange = e => { filterLang = e.target.value; render(); };
      box.querySelectorAll('.il-set-unblock').forEach(b => {
        b.onclick = () => { enableDomain(b.dataset.d); saveCfg(CFG); render(); actualizarBoton(); };
      });

      box.querySelectorAll('.il-set-mode').forEach(sel => {
        sel.onchange = () => { CFG.sites[+sel.dataset.idx].mode = sel.value; saveCfg(CFG); actualizarBoton(); };
      });
      box.querySelectorAll('.il-set-src').forEach(sel => {
        sel.onchange = () => {
          const idx = +sel.dataset.idx;
          if (!READER_SOURCES.includes(sel.value)) return;
          CFG.sites[idx].readerSource = sel.value;
          saveCfg(CFG);
        };
      });
      box.querySelectorAll('.il-set-lang').forEach(sel => {
        sel.onchange = () => {
          const idx = +sel.dataset.idx;
          CFG.sites[idx].lang = sel.value;
          saveCfg(CFG);
        };
      });
      box.querySelectorAll('.il-set-extract').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          openExtractionTool(+btn.dataset.idx, () => render());
        };
      });
      box.querySelectorAll('.il-set-visit').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const site = CFG.sites[+btn.dataset.idx];
          if (site) window.open('https://' + site.domain, '_blank', 'noopener');
        };
      });
      box.querySelectorAll('.il-set-del').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const removed = CFG.sites[+btn.dataset.idx];
          CFG.sites.splice(+btn.dataset.idx, 1);
          // Quitar un medio lo bloquea (sin botón); se desbloquea abajo.
          if (removed) disableDomain(removed.domain);
          saveCfg(CFG); render();
          if (removed && removed.domain === currentDomain) actualizarBoton();
        };
      });
      box.querySelectorAll('.il-set-delpat').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const site = CFG.sites[+btn.dataset.idx];
          if (!site) return;
          site.ignorePatterns.splice(+btn.dataset.pi, 1);
          saveCfg(CFG); render();
        };
      });
      box.querySelectorAll('.il-site-row').forEach(row => {
        row.addEventListener('dblclick', e => {
          if (e.target.closest('select,button,input,label,datalist,details')) return;
          const site = CFG.sites[+row.dataset.idx];
          if (site) window.open('https://' + site.domain, '_blank', 'noopener');
        });
      });

      const addCurrentBtn = box.querySelector('.il-set-add-current');
      if (addCurrentBtn) addCurrentBtn.onclick = () => {
        if (!currentDomain) return;
        if (CFG.sites.some(s => s.domain === currentDomain)){ toast(t('siteAlready')); return; }
        addSiteAnywhere(currentDomain);
        saveCfg(CFG);
        toast(t('addedTo') + ' ' + currentDomain);
        render();
        actualizarBoton();
      };

      const addBtn = box.querySelector('.il-set-add');
      if (addBtn) addBtn.onclick = () => {
        const inp = box.querySelector('.il-set-domain');
        const mode = box.querySelector('.il-set-newmode').value;
        const d = normalizeDomain(inp.value);
        if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){ toast(t('siteInvalid')); return; }
        if (CFG.sites.some(s => s.domain === d)){ toast(t('siteAlready')); return; }
        addSiteAnywhere(d, { mode: mode });
        saveCfg(CFG);
        render();
        if (d === currentDomain) actualizarBoton();
      };

      /* Foco al medio actual */
      if (currentDomain){
        setTimeout(() => {
          const row = box.querySelector('.il-site-row[data-domain="' + currentDomain + '"]');
          if (!row) return;
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const prevBg = row.style.background;
          const prevShadow = row.style.boxShadow;
          const prevRadius = row.style.borderRadius;
          row.style.transition = 'background .3s, box-shadow .3s';
          row.style.background = 'var(--quote-bg)';
          row.style.boxShadow = '0 0 0 2px var(--accent) inset';
          row.style.borderRadius = '6px';
          setTimeout(() => {
            row.style.background = prevBg || '';
            row.style.boxShadow = prevShadow || '';
            row.style.borderRadius = prevRadius || '';
          }, 3000);
        }, 80);
      }
    }

    return { html, wire };
  }

  function renderPendientesTab(){
    const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
    const noLeidas = pendientesVisibles().filter(r => !r.read);
    const leidas   = pendientesVisibles().filter(r => r.read);

    function fila(r, esLeida){
      // Leída: gris y tachada, sin transparencia (con ella no llegaba a 3:1).
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">' +
          '<div style="flex:1;min-width:0">' +
            '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" ' +
              'style="color:' + (esLeida ? 'var(--muted)' : 'var(--accent)') + ';text-decoration:none;font-weight:bold;font-size:14px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
              (esLeida ? ';text-decoration:line-through' : '') + '">' + esc(r.title || r.url) + '</a>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:2px">' +
              esc(r.domain || '') + ' · ' + esc((r.date || '').slice(0,10)) +
              (esLeida && r.readAt ? ' · ✓ ' + esc(r.readAt.slice(0,10)) : '') +
            '</div>' +
          '</div>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-toggle" title="' + esc(esLeida ? t('markUnread') : t('markRead')) + '" ' +
            'style="border:1px solid var(--preset);background:var(--bg);color:var(--preset);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">' +
            (esLeida ? '↺' : '✓') + '</button>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-del" title="' + esc(t('remove')) + '" ' +
            'style="border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✕</button>' +
        '</div>';
    }

    const rowsNoLeidas = noLeidas.map(r => fila(r, false)).join('');
    const rowsLeidas   = leidas.map(r => fila(r, true)).join('');

    const html =
      '<div style="margin-bottom:14px">' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:400px;overflow:auto">' +
          (rowsNoLeidas || '<div style="color:var(--muted);padding:8px 0;font-size:13px">' + esc(t('noReadLater')) + '</div>') +
        '</div>' +
      '</div>' +
      (keepRead && leidas.length ?
        '<div style="margin-bottom:14px">' +
          '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' +
            esc(t('readItems')) + ' (' + leidas.length + ')</div>' +
          '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:200px;overflow:auto;background:var(--quote-bg)">' +
            rowsLeidas +
          '</div>' +
        '</div>'
        : '') +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer">' +
          '<input type="checkbox" class="il-keep-read"' + (keepRead ? ' checked' : '') + '>' +
          esc(t('keepReadItems')) +
        '</label>' +
        (keepRead && leidas.length ?
          '<button class="il-clear-read" style="padding:6px 12px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;font-size:12px;color:var(--block)">' +
            esc(t('clearRead')) + '</button>'
          : '') +
      '</div>';

    function wire(){
      box.querySelectorAll('.il-rl-toggle').forEach(btn => {
        btn.onclick = () => { toggleReadLater(btn.dataset.url); render(); };
      });
      box.querySelectorAll('.il-rl-del').forEach(btn => {
        btn.onclick = () => { removeFromLater(btn.dataset.url); render(); };
      });
      const chk = box.querySelector('.il-keep-read');
      if (chk) chk.onchange = () => {
        CFG.readerSettings = CFG.readerSettings || {};
        CFG.readerSettings.keepReadItems = chk.checked;
        saveCfg(CFG);
        if (!chk.checked && pendientesVisibles().some(r => r.read)) borrarLeidos();
        render();
      };
      const clr = box.querySelector('.il-clear-read');
      if (clr) clr.onclick = () => {
        if (!confirm(t('clearReadConfirm'))) return;
        borrarLeidos();
        render();
      };
    }
    return { html, wire };
  }

  function renderDictTab(){
    const langs = [
      { code: 'es', label: t('dictDefaultEs') },
      { code: 'gl', label: t('dictDefaultGl') },
      { code: 'ca', label: t('dictDefaultCa') },
      { code: 'eu', label: t('dictDefaultEu') },
      { code: 'en', label: t('dictDefaultEn') },
      { code: 'fr', label: t('dictDefaultFr') },
      { code: 'de', label: t('dictDefaultDe') },
      { code: 'it', label: t('dictDefaultIt') },
      { code: 'pt', label: t('dictDefaultPt') }
    ];

    const blocks = langs.map(l => {
      const dicts = getDictsForLang(l.code);
      const defaultId = getDefaultDictId(l.code);
      const rows = dicts.map(d => dictRow(d, l.code, d.id === defaultId, !!d.builtin)).join('');
      return '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(l.label) + '</label>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">' + rows + '</div>' +
      '</div>';
    }).join('');

    const html =
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(t('dictMode')) + '</label>' +
        '<select class="il-dict-mode" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;width:100%">' +
          '<option value="direct"' + (CFG.dict.mode === 'direct' ? ' selected' : '') + '>' + esc(t('dictModeDirect')) + '</option>' +
          '<option value="popup"' + (CFG.dict.mode === 'popup' ? ' selected' : '') + '>' + esc(t('dictModePopup')) + '</option>' +
        '</select>' +
      '</div>' +
      blocks +
      '<div style="background:var(--quote-bg);border:1px solid var(--mark);border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:var(--muted)">' +
        esc(t('dictUrlHint')) +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<input class="il-dict-new-name" placeholder="' + esc(t('dictName')) + '" style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<input class="il-dict-new-url" placeholder="' + esc(t('dictUrl')) + '" style="flex:2;min-width:200px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<select class="il-dict-new-lang" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
          langs.map(l => '<option value="' + l.code + '">' + l.code.toUpperCase() + '</option>').join('') +
        '</select>' +
        '<button class="il-dict-add" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
      '</div>';

    function wire(){
      const modeSel = box.querySelector('.il-dict-mode');
      if (modeSel) modeSel.onchange = e => { CFG.dict.mode = e.target.value; saveCfg(CFG); };
      box.querySelectorAll('.il-dict-setdef').forEach(radio => {
        radio.onchange = () => {
          const l = radio.dataset.lang;
          const key = 'default' + l.charAt(0).toUpperCase() + l.slice(1);
          CFG.dict[key] = radio.value;
          saveCfg(CFG);
        };
      });
      box.querySelectorAll('.il-dict-del').forEach(btn => {
        btn.onclick = () => {
          const l = btn.dataset.lang;
          const id = btn.dataset.id;
          const key = 'custom' + l.charAt(0).toUpperCase() + l.slice(1);
          const arr = CFG.dict[key] || [];
          const idx = arr.findIndex(d => d.id === id);
          if (idx >= 0) arr.splice(idx, 1);
          saveCfg(CFG); render();
        };
      });
      const addDictBtn = box.querySelector('.il-dict-add');
      if (addDictBtn) addDictBtn.onclick = () => {
        const name = box.querySelector('.il-dict-new-name').value.trim();
        const url = box.querySelector('.il-dict-new-url').value.trim();
        const l = box.querySelector('.il-dict-new-lang').value;
        if (!name || !url.includes('{palabra}')){ toast(t('siteInvalid')); return; }
        const id = 'custom-' + Date.now();
        const key = 'custom' + l.charAt(0).toUpperCase() + l.slice(1);
        if (!Array.isArray(CFG.dict[key])) CFG.dict[key] = [];
        CFG.dict[key].push({ id: id, name: name, url: url, builtin: false });
        saveCfg(CFG); render();
      };
    }
    return { html, wire };
  }

  // «Abrir en…»: servicios a los que mandar la página. Vacío por defecto.
  function renderServiciosTab(){
    const servicios = serviciosConfigurados();
    const filas = servicios.map(svc =>
      '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<div style="flex:1;font-size:13px">' + esc(svc.nombre) + '</div>' +
        '<div style="flex:2;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(svc.plantilla) + '">' + esc(svc.plantilla) + '</div>' +
        '<button data-id="' + esc(svc.id) + '" class="il-svc-del" title="' + esc(t('serviciosQuitar')) +
          '" aria-label="' + esc(t('serviciosQuitar')) + '" ' +
          'style="border:none;background:transparent;cursor:pointer;color:var(--block);font-size:12px;padding:2px 6px">🗑</button>' +
      '</div>'
    ).join('');

    const html =
      '<div style="background:var(--quote-bg);border:1px solid var(--mark);border-radius:8px;padding:12px;margin-bottom:16px;' +
        'font-size:12px;color:var(--muted);line-height:1.6">' + esc(t('serviciosAyuda')) + '</div>' +
      '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:16px">' +
        (filas || '<div style="padding:8px 0;font-size:13px;color:var(--muted)">' + esc(t('serviciosVacio')) + '</div>') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        '<input class="il-svc-nombre" placeholder="' + esc(t('serviciosNombre')) + '" ' +
          'style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<input class="il-svc-plantilla" placeholder="https://…{url}" ' +
          'style="flex:2;min-width:200px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<button class="il-svc-add" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer">' +
          esc(t('add')) + '</button>' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:16px;cursor:pointer">' +
        '<input type="checkbox" class="il-svc-fab"' + (CFG.serviciosFab && CFG.serviciosFab.oculto ? '' : ' checked') + '> ' +
        esc(t('serviciosFab')) +
      '</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="il-svc-import" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('serviciosImportar')) + '</button>' +
        '<button class="il-svc-export" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer"' +
          (servicios.length ? '' : ' disabled') + '>' + esc(t('serviciosExportar')) + '</button>' +
      '</div>';

    const refrescarFab = actualizarBoton;

    function wire(){
      box.querySelectorAll('.il-svc-del').forEach(btn => {
        btn.onclick = () => {
          CFG.servicios = serviciosConfigurados().filter(svc => svc.id !== btn.dataset.id);
          saveCfg(CFG); render(); refrescarFab();
        };
      });
      box.querySelector('.il-svc-add').onclick = () => {
        const nombre = box.querySelector('.il-svc-nombre').value.trim();
        const plantilla = box.querySelector('.il-svc-plantilla').value.trim();
        if (!nombre || !plantillaServicioValida(plantilla)){ toast(t('serviciosInvalido'), 3200); return; }
        if (importarServicios([{ nombre, plantilla }]) < 1){ toast(t('serviciosRepetido'), 2400); return; }
        render(); refrescarFab();
      };
      box.querySelector('.il-svc-fab').onchange = e => {
        CFG.serviciosFab = { oculto: !e.target.checked };
        saveCfg(CFG); refrescarFab();
      };
      box.querySelector('.il-svc-import').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            let n = -1;
            try { n = importarServicios(JSON.parse(r.result)); } catch(e){}
            if (n < 0){ toast(t('serviciosFormato'), 3200); return; }
            toast(t('serviciosImportados').replace('{n}', n), 2400);
            render(); refrescarFab();
          };
          r.readAsText(f);
        };
        inp.click();
      };
      box.querySelector('.il-svc-export').onclick = () => {
        const lista = serviciosConfigurados().map(svc => ({ nombre: svc.nombre, plantilla: svc.plantilla }));
        const blob = new Blob([JSON.stringify({ servicios: lista }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'servicios.json';
        a.click();
        URL.revokeObjectURL(url);
      };
    }
    return { html, wire };
  }

  function renderShortcutsTab(){
    function keysHTML(keys){
      if (!Array.isArray(keys) || !keys.length){
        return '<em style="color:var(--muted)">' + esc(t('shortcutEmpty')) + '</em>';
      }
      return keys.map(k =>
        '<kbd style="display:inline-block;padding:2px 7px;border:1px solid var(--btn-border);border-radius:4px;' +
        'background:var(--btn-bg);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;margin:0 4px 0 0">' +
        esc(formatShortcut(k)) + '</kbd>'
      ).join('');
    }

    function rowHTML(scope, action){
      const keys = CFG.shortcuts[scope][action] || [];
      const isReserved = (scope === 'reader' && action === 'close');
      const isCapturing = scState.capture
        && scState.capture.scope === scope
        && scState.capture.action === action;
      const display = isCapturing
        ? '<em style="color:var(--accent)">' + esc(t('shortcutCapture')) + '</em>'
        : keysHTML(keys);
      return '<div class="il-sc-row" data-scope="' + scope + '" data-action="' + action + '" ' +
        'style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<div style="flex:1;font-size:13px">' + esc(shortcutActionLabel(action)) + '</div>' +
        '<div style="flex:1;text-align:right">' + display + '</div>' +
        (isReserved
          ? '<span style="font-size:11px;color:var(--muted);min-width:180px">' + esc(t('shortcutReservedNote')) + '</span>'
          : '<button class="il-sc-edit" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✏️</button>' +
            '<button class="il-sc-del" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">🗑</button>'
        ) +
      '</div>';
    }

    const readerActions = Object.keys(DEFAULT_CFG.shortcuts.reader);
    const globalActions = Object.keys(DEFAULT_CFG.shortcuts.global);

    const html =
      '<div style="background:var(--quote-bg);border:1px solid var(--mark);border-radius:8px;padding:12px;' +
        'margin-bottom:16px;font-size:12px;color:var(--muted);line-height:1.7">' +
        '<strong>' + esc(t('shortcutNoteTitle')) + '</strong><br>' +
        '• ' + esc(t('shortcutNoteReader')) + '<br>' +
        '• ' + esc(t('shortcutNoteGlobal')) + '<br>' +
        '• ' + esc(t('shortcutNoteCapture')) + '<br>' +
        '• ' + esc(t('shortcutReservedNote')) +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">' +
        '<button class="il-sc-reset" style="padding:6px 12px;border:1px solid var(--btn-border);background:var(--bg);' +
          'border-radius:6px;cursor:pointer;font-size:12px;color:var(--block)">' + esc(t('shortcutReset')) + '</button>' +
      '</div>' +
      '<div style="margin-bottom:22px">' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutReader')) + '</h3>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:0 12px">' +
          readerActions.map(a => rowHTML('reader', a)).join('') +
        '</div>' +
      '</div>' +
      '<div>' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutGlobal')) + '</h3>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:0 12px">' +
          globalActions.map(a => rowHTML('global', a)).join('') +
        '</div>' +
      '</div>';

    function wire(){
      box.querySelectorAll('.il-sc-edit').forEach(btn => {
        btn.onclick = () => {
          scState.capture = { scope: btn.dataset.scope, action: btn.dataset.action };
          render();
        };
      });
      box.querySelectorAll('.il-sc-del').forEach(btn => {
        btn.onclick = () => {
          const scope = btn.dataset.scope, action = btn.dataset.action;
          CFG.shortcuts[scope][action] = [];
          saveCfg(CFG);
          render();
        };
      });
      const resetBtn = box.querySelector('.il-sc-reset');
      if (resetBtn) resetBtn.onclick = () => {
        if (!confirm(t('shortcutResetConfirm'))) return;
        CFG.shortcuts = deepClone(DEFAULT_CFG.shortcuts);
        saveCfg(CFG);
        render();
      };

      if (scState.capture && !scListener){
        scListener = (e) => {
          if (!scState.capture) return;
          e.stopImmediatePropagation();
          e.preventDefault();

          if (e.key === 'Escape'){
            scState.capture = null;
            render();
            return;
          }
          if (e.key === 'Backspace' || e.key === 'Delete'){
            CFG.shortcuts[scState.capture.scope][scState.capture.action] = [];
            saveCfg(CFG);
            toast(t('shortcutCleared'), 1500);
            scState.capture = null;
            render();
            return;
          }
          if (['Control','Alt','Shift','Meta','OS'].includes(e.key)) return;

          const nk = normalizeKey(e);
          const scope  = scState.capture.scope;
          const action = scState.capture.action;

          if (RESERVED_BROWSER_KEYS.has(nk)){
            toast(t('shortcutReservedKey'), 2400);
            return;
          }
          if (scope === 'global' && !hasSafeModifier(nk)){
            toast(t('shortcutNeedsModifier'), 2600);
            return;
          }
          const conflict = findShortcutConflict(scope, action, nk);
          if (conflict){
            toast(t('shortcutConflict').replace('{X}', shortcutActionLabel(conflict)), 2600);
            return;
          }

          CFG.shortcuts[scope][action] = [nk];
          saveCfg(CFG);
          toast(t('shortcutSaved').replace('{X}', formatShortcut(nk)), 1500);
          scState.capture = null;
          render();
        };
        document.addEventListener('keydown', scListener, true);
      } else if (!scState.capture && scListener){
        document.removeEventListener('keydown', scListener, true);
        scListener = null;
      }
    }

    return { html, wire };
  }

  // Sincronización propia (28-sincronizacion.js). Este panel también se
  // abre encima de webs ajenas, que pueden leer lo que tiene: el código no
  // se pinta y solo se escribe en la página de Voceiro (Ajustes › Lector).
  function htmlSync(){
    const s = estadoSyncLector();
    const codigo = codigoSyncLector();
    const boton = (clase, texto, extra) =>
      '<button class="' + clase + '"' + (extra || '') + ' style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(texto) + '</button>';
    let estado = !codigo ? t('syncOff') : t(s.deVoceiro ? 'syncFromVoceiro' : 'syncManual');
    if (codigo){
      estado += ' ' + (s.subido ? t('syncLast') + ' ' + new Date(s.subido).toLocaleString(CFG.lang) + '.' : t('syncNever'));
      if ((s.fallo || 0) > (s.subido || 0)) estado += ' ' + t('syncFailed') + ' (' + (s.error || '?') + ')';
      if (!puedeSincronizarAqui()) estado += ' ' + t(esVoceiro() ? 'syncHereVoceiro' : 'syncNoHttps');
    }
    return '<div style="margin-bottom:18px;padding:14px;border:1px solid var(--btn-border);border-radius:8px">' +
        '<div style="font-weight:bold;font-size:14px">' + esc(t('syncTitle')) + '</div>' +
        '<p class="il-set-sync-estado" style="font-size:13px;margin:6px 0 10px">' + esc(estado) + '</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          (codigo
            ? boton('il-set-sync-ahora', t('syncNow'), puedeSincronizarAqui() ? '' : ' disabled') +
              boton('il-set-sync-quitar', t('syncUnlink'))
            : !esVoceiro() ? '<span style="font-size:13px">' + esc(t('syncSoloEnVoceiro')) + '</span>'
            : '<input type="text" class="il-set-sync-codigo" autocomplete="off" spellcheck="false" aria-label="' + esc(t('syncCodePh')) + '" placeholder="' + esc(t('syncCodePh')) + '" style="flex:1 1 16em;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;font-family:monospace">' +
              boton('il-set-sync-usar', t('syncUse'))) +
        '</div>' +
        '<p style="font-size:12px;color:var(--muted);margin:8px 0 0">' + esc(t('syncHint')) + '</p>' +
      '</div>';
  }
  function wireSync(){
    const usar = box.querySelector('.il-set-sync-usar');
    if (usar) usar.onclick = () => {
      const campo = box.querySelector('.il-set-sync-codigo');
      if (!activarSyncLector(campo.value, false)){ toast(t('syncInvalid'), 2400); campo.focus(); return; }
      render();
      sincronizarLector().then(render);
    };
    const ahora = box.querySelector('.il-set-sync-ahora');
    if (ahora) ahora.onclick = () => {
      ahora.disabled = true;
      sincronizarLector().then(render);
    };
    const quitar = box.querySelector('.il-set-sync-quitar');
    if (quitar) quitar.onclick = () => {
      if (!confirm(t('syncUnlinkConfirm'))) return;
      olvidarSyncLector();
      render();
    };
  }

  function renderGeneralTab(){
    const html =
      '<div style="margin-bottom:18px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(t('language')) + '</label>' +
        '<select class="il-set-lang-app" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
          '<option value="es"' + (CFG.lang==='es'?' selected':'') + '>Español</option>' +
          '<option value="gl"' + (CFG.lang==='gl'?' selected':'') + '>Galego</option>' +
          '<option value="ca"' + (CFG.lang==='ca'?' selected':'') + '>Català</option>' +
          '<option value="en"' + (CFG.lang==='en'?' selected':'') + '>English</option>' +
          '<option value="eu"' + (CFG.lang==='eu'?' selected':'') + '>Euskara</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:18px;padding:14px;border:2px solid ' + (CFG.readerAutoAll ? 'var(--preset)' : 'var(--btn-border)') + ';border-radius:8px;background:' + (CFG.readerAutoAll ? 'var(--preset-bg)' : 'var(--quote-bg)') + '">' +
        '<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">' +
          '<input type="checkbox" class="il-set-auto-all"' + (CFG.readerAutoAll ? ' checked' : '') + ' style="margin-top:3px;width:18px;height:18px;cursor:pointer;flex:0 0 auto">' +
          '<span>' +
            '<span style="display:block;font-weight:bold;font-size:14px;color:' + (CFG.readerAutoAll ? 'var(--preset)' : 'var(--fg)') + '">' +
              (CFG.readerAutoAll ? '🟢 ACTIVADO — ' : '⚪ DESACTIVADO — ') +
              esc(t('readerAutoAllLabel')) +
            '</span>' +
            '<span style="display:block;font-size:12px;color:var(--muted);margin-top:4px">' + esc(t('readerAutoAllHint')) + '</span>' +
          '</span>' +
        '</label>' +
      '</div>' +
      htmlSync() +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:14px">' +
        '<button class="il-set-export" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('exportBtn')) + '</button>' +
        '<button class="il-set-import" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('importBtn')) + '</button>' +
        '<button class="il-set-reset"  style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;color:var(--block);margin-left:auto">' + esc(t('resetBtn')) + '</button>' +
      '</div>';

    function wire(){
      wireSync();
      const appLangSel = box.querySelector('.il-set-lang-app');
      if (appLangSel) appLangSel.onchange = e => {
        CFG.lang = e.target.value;
        saveCfg(CFG);
        render();
        actualizarBoton();
      };

      const autoAllChk = box.querySelector('.il-set-auto-all');
      if (autoAllChk) autoAllChk.onchange = () => {
        CFG.readerAutoAll = autoAllChk.checked;
        saveCfg(CFG);
        actualizarBoton();
        toast(CFG.readerAutoAll ? t('readerAutoAllOn') : t('readerAutoAllOff'), 1800);
        render();
      };

      box.querySelector('.il-set-export').onclick = () => {
        const data = JSON.stringify(Object.assign({}, CFG, { _version: SCRIPT_VERSION }), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'lector-universal-config.json';
        a.click();
        URL.revokeObjectURL(url);
      };
      box.querySelector('.il-set-import').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            try {
              const data = JSON.parse(r.result);

              if (data._app === 'voceiro'){
                const importData = {};
                if (Array.isArray(data.sites))                 importData.sites = data.sites;
                if (Array.isArray(data.disabledDomains))       importData.disabledDomains = data.disabledDomains;
                if (data.prefs && typeof data.prefs === 'object') importData.prefs = data.prefs;
                if (typeof data.lang === 'string')             importData.lang = data.lang;
                if (typeof data.readerAutoAll === 'boolean')   importData.readerAutoAll = data.readerAutoAll;
                if (data.readerSettings && typeof data.readerSettings === 'object')
                  importData.readerSettings = data.readerSettings;
                CFG = mergeCfg(DEFAULT_CFG, importData);
                saveCfg(CFG);
                toast('✅ Configuración de Voceiro importada', 2400);
                render();
                return;
              }

              if (data._version && data._version !== SCRIPT_VERSION){
                toast(t('exportWarningVersion'), 3200);
              }
              delete data._version;
              CFG = mergeCfg(DEFAULT_CFG, data);
              saveCfg(CFG);
              sincronizarLectorPronto();   // saveCfg no mira Pendientes
              render();
            } catch(e){ toast('Error: ' + e.message); }
          };
          r.readAsText(f);
        };
        inp.click();
      };
      box.querySelector('.il-set-reset').onclick = () => {
        if (!confirm(t('confirmReset'))) return;
        CFG = migrateCfg(deepClone(DEFAULT_CFG));
        saveCfg(CFG);
        render();
      };
    }

    return { html, wire };
  }

  function render(){
    const tabsHTML =
      '<div style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:18px;flex-wrap:wrap">' +
        tabBtn('sites', t('sites')) +
        tabBtn('pendientes', t('pendientes')) +
        tabBtn('dict', t('dictionaries')) +
        tabBtn('servicios', t('abrirEn')) +
        tabBtn('shortcuts', t('shortcuts')) +
        tabBtn('general', t('settings')) +
      '</div>';

    const headerHTML = dentro ? '' :
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<h2 style="margin:0;font-size:20px">' + esc(t('settings')) + '</h2>' +
        '<button class="il-set-close" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('close')) + '</button>' +
      '</div>';

    let payload;
    if (activeSection === 'sites')         payload = renderSitesTab();
    else if (activeSection === 'pendientes') payload = renderPendientesTab();
    else if (activeSection === 'dict')       payload = renderDictTab();
    else if (activeSection === 'servicios')  payload = renderServiciosTab();
    else if (activeSection === 'shortcuts')  payload = renderShortcutsTab();
    else                                     payload = renderGeneralTab();

    box.innerHTML = headerHTML + tabsHTML + payload.html;

    const cerrar = box.querySelector('.il-set-close');
    if (cerrar) cerrar.onclick = closeSettings;
    box.querySelectorAll('.il-set-tab').forEach(b => {
      b.onclick = () => { activeSection = b.dataset.tab; render(); };
    });

    payload.wire();
  }

  render();
  if (!dentro) box.focus({ preventScroll: true });
}

