/* ============================================================
   24. PANEL DE CONFIGURACIÓN
   ============================================================ */
function openSettings(initialTab){
  if (document.getElementById('il-settings')) return;
  const root = document.createElement('div');
  root.id = 'il-settings';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;color:#222;border-radius:12px;max-width:960px;width:100%;' +
    'max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:24px';
  root.appendChild(box);
  document.body.appendChild(root);

  let activeSection = initialTab || 'sites';
  let activeCatalogSub = 'media';
  let searchQuery = '';
  let filterLang = '';
  let filterType = '';
  let filterTag = '';
  let catalogQuery = '';
  let catalogFilter = 'all';
  let catalogLangFilter = '';
  let catalogTypeFilter = '';
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
  document.addEventListener('keydown', escHandler, true);
  root.addEventListener('click', e => { if (e.target === root) closeSettings(); });

  function dictRow(d, lang, isDefault, isBuiltin){
    const canDelete = !isBuiltin;
    return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0">' +
      '<div style="flex:1;font-size:13px">' + esc(d.name) + '</div>' +
      '<div style="font-size:11px;color:#888;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.url) + '</div>' +
      '<input type="radio" name="def-' + lang + '" value="' + esc(d.id) + '"' + (isDefault ? ' checked' : '') +
        ' data-lang="' + lang + '" class="il-dict-setdef" style="cursor:pointer" title="Predeterminado">' +
      (canDelete ? '<button data-lang="' + lang + '" data-id="' + esc(d.id) + '" class="il-dict-del" ' +
        'style="border:none;background:transparent;cursor:pointer;color:#c00;font-size:12px;padding:2px 6px">🗑</button>' : '') +
    '</div>';
  }

  function tabBtn(id, label){
    return '<button class="il-set-tab" data-tab="' + id + '" style="padding:8px 16px;border:none;' +
      'border-bottom:2px solid ' + (activeSection === id ? '#d32f2f' : 'transparent') + ';' +
      'background:transparent;cursor:pointer;font-weight:bold;color:' +
      (activeSection === id ? '#d32f2f' : '#666') + '">' + esc(label) + '</button>';
  }

  function subTabBtn(parent, id, label){
    const active = activeCatalogSub === id;
    return '<button class="il-cat-subtab" data-subtab="' + id + '" style="padding:6px 14px;border:1px solid ' +
      (active ? '#d32f2f' : '#ccc') + ';background:' + (active ? '#d32f2f' : '#fff') +
      ';color:' + (active ? '#fff' : '#444') + ';border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;' +
      'margin-right:6px">' + esc(label) + '</button>';
  }

  function extractionBadge(ex){
    if (!ex || ex.mode === 'auto') return '';
    const label = ex.mode === 'selector' ? '🎯' : ex.mode === 'all' ? '📄' : '';
    const title = ex.mode === 'selector' ? ('Selector: ' + (ex.root || '—'))
                : ex.mode === 'all' ? 'Todo el texto'
                : '';
    return ' · <span style="color:#0a7d00;font-weight:bold" title="' + esc(title) + '">' + label + '</span>';
  }

  function langLabel(lang){
    if (lang === 'auto') return t('langAuto');
    const key = 'lang' + lang.charAt(0).toUpperCase() + lang.slice(1);
    return t(key) || lang;
  }

  function renderSitesTab(){
    const currentDomain = normalizeDomain(location.hostname);
    const currentDomainInList = currentDomain && CFG.sites.some(s => s.domain === currentDomain);

    const sitesFiltered = CFG.sites.filter(s => {
      if (searchQuery && !s.domain.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterLang && s.lang !== filterLang) return false;
      if (filterType && s.type !== filterType) return false;
      if (filterTag && !(s.tags || []).includes(filterTag)) return false;
      return true;
    });
    const knownTags = getAllKnownTags();

    const siteRows = sitesFiltered.map((s) => {
      const realIdx = CFG.sites.indexOf(s);
      const pats = (s.ignorePatterns || []).map((p, pi) =>
        '<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f1f1;' +
          'border-radius:12px;padding:2px 4px 2px 10px;font-family:monospace;font-size:11px;margin:2px 4px 2px 0">' +
          esc(p) +
          '<button data-idx="' + realIdx + '" data-pi="' + pi + '" class="il-set-delpat" ' +
            'style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:0 4px;color:#c00">✕</button>' +
        '</span>').join('');
      const patBlock = '<div style="margin-top:4px;font-size:11px;color:#666">' +
        '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('ignoredSections')) + ':</span> ' +
        (pats || '<span style="color:#aaa">' + esc(t('noIgnoredSections')) + '</span>') +
      '</div>';
      const tagsStr = (s.tags || []).join(', ');
      const typeLabel = s.type ? getTypeLabel(s.type) : '—';
      const textOnlyBadge = s.textOnly ? ' · <span style="color:#d32f2f;font-weight:bold">📝</span>' : '';
      const exBadge = extractionBadge(s.extraction);
      return '<div class="il-site-row" data-idx="' + realIdx + '" data-domain="' + esc(s.domain) + '" style="padding:8px 0;border-bottom:1px solid #eee;cursor:pointer">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:140px;font-family:monospace;font-size:13px">' + esc(s.domain) + '</div>' +
          '<select data-idx="' + realIdx + '" class="il-set-mode" style="padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px">' +
            '<option value="off"'    + (s.mode==='off'   ?' selected':'') + '>' + esc(t('modeOff'))    + '</option>' +
            '<option value="prompt"' + (s.mode==='prompt'?' selected':'') + '>' + esc(t('modePrompt')) + '</option>' +
            '<option value="auto"'   + (s.mode==='auto'  ?' selected':'') + '>' + esc(t('modeAuto'))   + '</option>' +
          '</select>' +
          '<select data-idx="' + realIdx + '" class="il-set-src" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px">' +
            '<option value="auto"' + (s.readerSource==='auto'?' selected':'') + '>' + esc(t('srcAuto')) + '</option>' +
            '<option value="jsonld"' + (s.readerSource==='jsonld'?' selected':'') + '>' + esc(t('srcJsonld')) + '</option>' +
            '<option value="readability"' + (s.readerSource==='readability'?' selected':'') + '>' + esc(t('srcReadability')) + '</option>' +
          '</select>' +
          '<select data-idx="' + realIdx + '" class="il-set-lang" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px">' +
            SITE_LANGS.map(l => '<option value="' + l + '"' + (s.lang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('') +
          '</select>' +
          '<button data-idx="' + realIdx + '" class="il-set-extract" title="' + esc(t('extractionTitle')) + '" ' +
            'style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">🔬</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-visit" title="' + esc(t('openSite')) + '" ' +
            'style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">🔗</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-edit" title="Editar" ' +
            'style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">✏️</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-del" style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">🗑</button>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:11px;color:#666">' +
          '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colLang')) + ':</span> ' + esc(langLabel(s.lang)) +
          ' · <span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colType')) + ':</span> ' + esc(typeLabel) +
          (tagsStr ? ' · <span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colTags')) + ':</span> ' + esc(tagsStr) : '') +
          textOnlyBadge + exBadge +
        '</div>' +
        patBlock +
      '</div>';
    }).join('');

    const langFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterLang')) + '</option>' +
      SITE_LANGS.map(l => '<option value="' + l + '"' + (filterLang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('');
    const typeFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterType')) + '</option>' +
      CFG.siteTypes.map(tt => '<option value="' + esc(tt.id) + '"' + (filterType===tt.id?' selected':'') + '>' + esc(tt.label) + '</option>').join('');
    const tagFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterTag')) + '</option>' +
      knownTags.map(tg => '<option value="' + esc(tg) + '"' + (filterTag===tg?' selected':'') + '>' + esc(tg) + '</option>').join('');

    const addCurrentBanner = currentDomain && !currentDomainInList
      ? '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:10px 14px;' +
          'margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap">' +
          '<span style="flex:1;min-width:140px">📍 ' + esc(t('currentSiteHint')) + ': <strong style="font-family:monospace">' + esc(currentDomain) + '</strong></span>' +
          '<button class="il-set-add-current" style="padding:6px 14px;background:#0a7d00;color:#fff;border:none;' +
            'border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;white-space:nowrap">+ ' + esc(t('addCurrentShort')) + '</button>' +
        '</div>'
      : '';

    const html =
      addCurrentBanner +
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">' +
        '<input class="il-set-search" placeholder="' + esc(t('searchPlaceholder')) + '" value="' + esc(searchQuery) + '" ' +
          'style="flex:1;min-width:140px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<select class="il-filter-lang" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + langFilterOpts + '</select>' +
        '<select class="il-filter-type" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + typeFilterOpts + '</select>' +
        '<select class="il-filter-tag" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + tagFilterOpts + '</select>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;max-height:340px;overflow:auto">' +
          (siteRows || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noSites')) + '</div>') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">' +
        '<input class="il-set-domain" placeholder="' + esc(t('domainPh')) + '" style="flex:1;min-width:180px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<select class="il-set-newmode" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          '<option value="prompt" selected>' + esc(t('modePrompt')) + '</option>' +
          '<option value="auto">' + esc(t('modeAuto')) + '</option>' +
          '<option value="off">' + esc(t('modeOff')) + '</option>' +
        '</select>' +
        '<button class="il-set-add" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
      '</div>';

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
      const typeSel = box.querySelector('.il-filter-type');
      if (typeSel) typeSel.onchange = e => { filterType = e.target.value; render(); };
      const tagSel = box.querySelector('.il-filter-tag');
      if (tagSel) tagSel.onchange = e => { filterTag = e.target.value; render(); };

      box.querySelectorAll('.il-set-mode').forEach(sel => {
        sel.onchange = () => { CFG.sites[+sel.dataset.idx].mode = sel.value; saveCfg(CFG); };
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
          if (!isBaseCatalogDomain(CFG.sites[idx].domain)){
            addOrUpdateCustomCatalogEntry(CFG.sites[idx].domain, {
              lang: CFG.sites[idx].lang,
              type: CFG.sites[idx].type,
              tags: CFG.sites[idx].tags,
              n: CFG.sites[idx].domain
            });
            saveCfg(CFG);
          }
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
      box.querySelectorAll('.il-set-edit').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const idx = +btn.dataset.idx;
          const site = CFG.sites[idx];
          if (!site) return;
          const row = box.querySelector('.il-site-row[data-idx="' + idx + '"]');
          if (!row) return;
          const existing = row.querySelector('.il-edit-block');
          if (existing) { existing.remove(); return; }
          const block = document.createElement('div');
          block.className = 'il-edit-block';
          block.style.cssText = 'margin-top:8px;padding:10px;background:#f9f9f9;border-radius:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center';
          const typeOpts = '<option value=""' + (!site.type?' selected':'') + '>—</option>' +
            CFG.siteTypes.map(tt => '<option value="' + esc(tt.id) + '"' + (site.type===tt.id?' selected':'') + '>' + esc(tt.label) + '</option>').join('');
          const datalistId = 'il-known-tags-' + idx;
          const datalist = '<datalist id="' + datalistId + '">' +
            getAllKnownTags().map(tg => '<option value="' + esc(tg) + '"></option>').join('') + '</datalist>';
          block.innerHTML =
            '<label style="font-size:11px;color:#666;text-transform:uppercase">' + esc(t('siteType')) + '</label>' +
            '<select class="il-edit-type" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px">' + typeOpts + '</select>' +
            '<label style="font-size:11px;color:#666;text-transform:uppercase">' + esc(t('siteTags')) + '</label>' +
            '<input class="il-edit-tags" list="' + datalistId + '" value="' + esc((site.tags||[]).join(', ')) + '" ' +
              'style="flex:1;min-width:140px;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px">' +
            datalist +
            '<button class="il-edit-save" style="padding:6px 10px;background:#d32f2f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-left:auto">' + esc(t('saveBtn')) + '</button>' +
            '<button class="il-edit-cancel" style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px">' + esc(t('cancelBtn')) + '</button>';
          row.appendChild(block);
          block.querySelector('.il-edit-save').onclick = () => {
            const type = block.querySelector('.il-edit-type').value;
            const rawTags = block.querySelector('.il-edit-tags').value.split(',').map(x => x.trim()).filter(Boolean);
            const uniqueTags = Array.from(new Set(rawTags));
            CFG.sites[idx].type = type;
            CFG.sites[idx].tags = uniqueTags;
            const global = new Set(CFG.siteTags || []);
            uniqueTags.forEach(tg => global.add(tg));
            CFG.siteTags = Array.from(global).sort();
            if (!isBaseCatalogDomain(CFG.sites[idx].domain)){
              addOrUpdateCustomCatalogEntry(CFG.sites[idx].domain, {
                lang: CFG.sites[idx].lang, type: type, tags: uniqueTags,
                n: CFG.sites[idx].domain
              });
            }
            saveCfg(CFG);
            render();
          };
          block.querySelector('.il-edit-cancel').onclick = () => block.remove();
        };
      });
      box.querySelectorAll('.il-set-del').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const removed = CFG.sites[+btn.dataset.idx];
          CFG.sites.splice(+btn.dataset.idx, 1);
          if (removed && isBaseCatalogDomain(removed.domain)){
            disableDomain(removed.domain);
          } else if (removed){
            disableDomain(removed.domain);
          }
          saveCfg(CFG); render();
          if (removed && removed.domain === currentDomain){
            const f = document.getElementById('il-fab'); if (f) f.remove();
            const bf = document.getElementById('il-servicios-fab'); if (bf) bf.remove();
            ensureAddFAB();
            repositionStackFABs();
          }
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
          if (e.target.closest('select,button,input,label,datalist')) return;
          const site = CFG.sites[+row.dataset.idx];
          if (site) window.open('https://' + site.domain, '_blank', 'noopener');
        });
      });

      const addCurrentBtn = box.querySelector('.il-set-add-current');
      if (addCurrentBtn) addCurrentBtn.onclick = () => {
        if (!currentDomain) return;
        if (CFG.sites.some(s => s.domain === currentDomain)){ toast(t('siteAlready')); return; }
        const cat = getCatalogEntry(currentDomain) || {};
        addSiteAnywhere(currentDomain, {
          n: cat.n || currentDomain,
          lang: cat.lang || 'auto',
          type: cat.type || '',
          tags: cat.tags || []
        });
        saveCfg(CFG);
        toast(t('addedTo') + ' ' + currentDomain);
        render();
        const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
        if (!document.getElementById('il-fab') && !isPlainDomain()){
          const rule = findSiteRule();
          if (rule && rule.mode !== 'off' && !isIgnoredSection(rule)) createFAB();
        }
        if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
        repositionStackFABs();
      };

      const addBtn = box.querySelector('.il-set-add');
      if (addBtn) addBtn.onclick = () => {
        const inp = box.querySelector('.il-set-domain');
        const mode = box.querySelector('.il-set-newmode').value;
        const d = normalizeDomain(inp.value);
        if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){ toast(t('siteInvalid')); return; }
        if (CFG.sites.some(s => s.domain === d)){ toast(t('siteAlready')); return; }
        const cat = getCatalogEntry(d) || {};
        addSiteAnywhere(d, {
          mode: mode, n: cat.n || d,
          lang: cat.lang || 'auto',
          type: cat.type || '',
          tags: cat.tags || []
        });
        saveCfg(CFG);
        render();
        if (d === currentDomain){
          const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
          if (!document.getElementById('il-fab') && !isPlainDomain()){
            const rule = findSiteRule();
            if (rule && rule.mode === 'prompt' && !isIgnoredSection(rule)) createFAB();
          }
          if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
          repositionStackFABs();
        }
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
          row.style.background = '#fffbe6';
          row.style.boxShadow = '0 0 0 2px #d32f2f inset';
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

  function renderCatalogTab(){
    const currentDomain = normalizeDomain(location.hostname);

    const subTabsHTML =
      '<div style="margin-bottom:14px">' +
        subTabBtn('catalog', 'media', '📚 ' + t('catalogSubMedia')) +
        subTabBtn('catalog', 'types', '🏷 ' + t('catalogSubTypes')) +
      '</div>';

    function renderCatalogMedia(){
      const allGroups = MEDIA_CATALOG.map(g => ({ group: g.group, items: g.items.slice() }));
      if ((CFG.customCatalog || []).length){
        allGroups.push({ group: 'Personalizados', items: CFG.customCatalog.slice() });
      }

      const filteredGroups = allGroups.map(g => {
        const items = g.items.filter(it => {
          if (catalogLangFilter && it.lang !== catalogLangFilter) return false;
          if (catalogTypeFilter && it.type !== catalogTypeFilter) return false;
          if (catalogQuery){
            const q = catalogQuery.toLowerCase();
            if (!it.d.toLowerCase().includes(q) && !(it.n||'').toLowerCase().includes(q)) return false;
          }
          const inList = CFG.sites.some(s => s.domain === it.d);
          const isBlocked = isDomainDisabled(it.d);
          if (catalogFilter === 'added' && !inList) return false;
          if (catalogFilter === 'notadded' && inList) return false;
          if (catalogFilter === 'blocked' && !isBlocked) return false;
          return true;
        });
        return { group: g.group, items };
      }).filter(g => g.items.length);

      const totalShown = filteredGroups.reduce((a, g) => a + g.items.length, 0);
      const totalBase = CATALOG_TOTAL + (CFG.customCatalog||[]).length;

      const langOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterLang')) + '</option>' +
        CATALOG_LANGS.map(l => '<option value="' + esc(l) + '"' + (catalogLangFilter===l?' selected':'') + '>' +
          esc(l.toUpperCase()) + '</option>').join('');
      const typeOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterType')) + '</option>' +
        CFG.siteTypes.map(tt => '<option value="' + esc(tt.id) + '"' + (catalogTypeFilter===tt.id?' selected':'') + '>' +
          esc(tt.label) + '</option>').join('');
      const filterBtns =
        '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">' +
          ['all','notadded','added','blocked'].map(f => {
            const labels = { all: t('allMedia'), notadded: t('filterNotAdded'), added: t('filterAdded'), blocked: t('filterBlocked') };
            const active = catalogFilter === f;
            return '<button class="il-cat-filter" data-filter="' + f + '" style="padding:6px 12px;border:1px solid ' +
              (active ? '#d32f2f' : '#ccc') + ';background:' + (active ? '#d32f2f' : '#fff') +
              ';color:' + (active ? '#fff' : '#444') + ';border-radius:6px;cursor:pointer;font-size:12px">' +
              esc(labels[f]) + '</button>';
          }).join('') +
        '</div>';

      const groupsHTML = filteredGroups.map(g => {
        const rows = g.items.map(it => {
          const inList = CFG.sites.some(s => s.domain === it.d);
          const isBlocked = isDomainDisabled(it.d);
          const isCurrent = it.d === currentDomain;

          let actionBtns = '';
          if (inList){
            actionBtns =
              '<button class="il-cat-remove" data-d="' + esc(it.d) + '" title="' + esc(t('remove')) + '" ' +
                'style="padding:4px 10px;border:1px solid #c00;background:#fff;color:#c00;border-radius:5px;cursor:pointer;font-size:12px">✕</button>';
          } else if (isBlocked){
            actionBtns =
              '<button class="il-cat-unblock" data-d="' + esc(it.d) + '" title="' + esc(t('unblock')) + '" ' +
                'style="padding:4px 10px;border:1px solid #0a7d00;background:#fff;color:#0a7d00;border-radius:5px;cursor:pointer;font-size:12px">↺</button>';
          } else {
            actionBtns =
              '<button class="il-cat-add" data-d="' + esc(it.d) + '" title="' + esc(t('addToMyList')) + '" ' +
                'style="padding:4px 10px;border:none;background:#0a7d00;color:#fff;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold">＋</button>';
          }

          const statusBadge = inList
            ? '<span style="color:#0a7d00;font-size:11px;font-weight:bold">✅ ' + esc(t('inYourList')) + '</span>'
            : isBlocked
            ? '<span style="color:#c00;font-size:11px;font-weight:bold">🚫 ' + esc(t('blocked')) + '</span>'
            : '';

          return '<div class="il-cat-row" data-d="' + esc(it.d) + '" style="display:flex;gap:10px;align-items:center;padding:7px 4px;border-bottom:1px solid #f0f0f0' + (isCurrent ? ';background:#fffbe6' : '') + '">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-family:monospace;font-size:12px;font-weight:bold;color:#222">' + esc(it.d) + (isCurrent ? ' 📍' : '') + '</div>' +
              '<div style="font-size:11px;color:#666">' + esc(it.n || '') +
                ' · ' + esc((it.lang||'').toUpperCase()) +
                (it.type ? ' · ' + esc(getTypeLabel(it.type)) : '') +
                ((it.tags||[]).length ? ' · ' + esc(it.tags.join(', ')) : '') +
              '</div>' +
            '</div>' +
            statusBadge +
            '<button class="il-cat-visit" data-d="' + esc(it.d) + '" title="' + esc(t('visitSite')) + '" ' +
              'style="padding:4px 10px;border:1px solid #ccc;background:#fff;border-radius:5px;cursor:pointer;font-size:12px">🔗</button>' +
            actionBtns +
          '</div>';
        }).join('');
        return '<div style="margin-bottom:18px">' +
          '<div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:bold">' +
            esc(g.group) + ' <span style="color:#aaa">(' + g.items.length + ')</span></div>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:4px 10px">' + rows + '</div>' +
        '</div>';
      }).join('');

      const html =
        '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:10px 14px;' +
          'margin-bottom:14px;font-size:12px;color:#333;line-height:1.5">' +
          '💡 ' + esc(t('catalogInfo').replace('{N}', totalBase)) +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
          '<input class="il-cat-search" placeholder="' + esc(t('searchCatalog')) + '" value="' + esc(catalogQuery) + '" ' +
            'style="flex:1;min-width:180px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          '<select class="il-cat-lang" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + langOpts + '</select>' +
          '<select class="il-cat-type" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + typeOpts + '</select>' +
        '</div>' +
        filterBtns +
        '<div style="font-size:11px;color:#888;margin-bottom:10px">' +
          totalShown + ' / ' + totalBase + ' ' + esc(t('allMedia').toLowerCase()) +
        '</div>' +
        (groupsHTML || '<div style="color:#888;padding:20px;text-align:center;font-size:13px">—</div>');

      function wire(){
        const searchInp = box.querySelector('.il-cat-search');
        if (searchInp) searchInp.oninput = e => {
          const pos = e.target.selectionStart;
          catalogQuery = e.target.value;
          render();
          const ni = box.querySelector('.il-cat-search');
          if (ni){ ni.focus(); ni.setSelectionRange(pos, pos); }
        };
        const langSel = box.querySelector('.il-cat-lang');
        if (langSel) langSel.onchange = e => { catalogLangFilter = e.target.value; render(); };
        const typeSel = box.querySelector('.il-cat-type');
        if (typeSel) typeSel.onchange = e => { catalogTypeFilter = e.target.value; render(); };

        box.querySelectorAll('.il-cat-filter').forEach(b => {
          b.onclick = () => { catalogFilter = b.dataset.filter; render(); };
        });
        box.querySelectorAll('.il-cat-visit').forEach(b => {
          b.onclick = () => window.open('https://' + b.dataset.d, '_blank', 'noopener');
        });
        box.querySelectorAll('.il-cat-add').forEach(b => {
          b.onclick = () => {
            const d = b.dataset.d;
            const entry = getCatalogEntry(d) || (CFG.customCatalog||[]).find(x => x.d === d);
            if (!entry) return;
            if (addSiteFromCatalog(entry)){
              saveCfg(CFG);
              toast(t('addedTo') + ' ' + entry.d, 2000);
              render();
              if (entry.d === currentDomain){
                const af = document.getElementById('il-add-fab'); if (af) af.remove();
                ensureReaderFAB();
                if (debeMostrarFabServicios()) crearFabServicios();
                repositionStackFABs();
              }
            }
          };
        });
        box.querySelectorAll('.il-cat-remove').forEach(b => {
          b.onclick = () => {
            const d = b.dataset.d;
            if (removeSiteForDomain(d)){
              disableDomain(d);
              saveCfg(CFG);
              toast(t('removedFrom') + ' ' + d, 2000);
              render();
              if (d === currentDomain){
                const f = document.getElementById('il-fab'); if (f) f.remove();
                const bf = document.getElementById('il-servicios-fab'); if (bf) bf.remove();
                repositionStackFABs();
              }
            }
          };
        });
        box.querySelectorAll('.il-cat-unblock').forEach(b => {
          b.onclick = () => {
            enableDomain(b.dataset.d);
            saveCfg(CFG);
            toast(t('unblock') + ': ' + b.dataset.d, 1800);
            render();
          };
        });
      }

      return { html, wire };
    }

    function renderCatalogTypes(){
      const builtin = (CFG.siteTypes || []).filter(tt => tt.builtin);
      const custom = (CFG.siteTypes || []).filter(tt => !tt.builtin);

      function typeRow(tt){
        const idx = CFG.siteTypes.indexOf(tt);
        const affected = CFG.sites.filter(s => s.type === tt.id).length;
        return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0">' +
          '<code style="font-size:11px;color:#999;min-width:90px">' + esc(tt.id) + '</code>' +
          '<input class="il-type-label" data-idx="' + idx + '" value="' + esc(tt.label) + '" ' +
            'style="flex:1;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px">' +
          '<span style="font-size:11px;color:#888;min-width:80px;text-align:right">' +
            (affected ? affected + ' sitios' : '') + '</span>' +
          (tt.builtin
            ? '<span style="font-size:11px;color:#999;min-width:24px;text-align:center" title="Predefinido">🔒</span>'
            : '<button class="il-type-del" data-idx="' + idx + '" ' +
                'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">🗑</button>'
          ) +
        '</div>';
      }

      const builtinRows = builtin.map(typeRow).join('');
      const customRows = custom.map(typeRow).join('');

      const tagChips = (CFG.siteTags || []).map((tg, i) =>
        '<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f1f1;border-radius:12px;padding:3px 4px 3px 10px;font-size:12px;margin:3px 4px 3px 0">' +
          esc(tg) +
          '<button class="il-tag-del" data-idx="' + i + '" style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:0 4px;color:#c00">✕</button>' +
        '</span>').join('');

      const html =
        '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:10px 14px;' +
          'margin-bottom:16px;font-size:12px;color:#555;line-height:1.5">' +
          esc(t('typesHint')) +
        '</div>' +
        '<div style="margin-bottom:22px">' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' +
            esc(t('defaultTypes')) + ' <span style="color:#aaa">(' + builtin.length + ')</span></label>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:4px 12px;margin-bottom:12px">' +
            (builtinRows || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noTypes')) + '</div>') +
          '</div>' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' +
            esc(t('customTypes')) + ' <span style="color:#aaa">(' + custom.length + ')</span></label>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:4px 12px;margin-bottom:8px">' +
            (customRows || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noTypes')) + '</div>') +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<input class="il-new-type" placeholder="' + esc(t('newTypePh')) + '" style="flex:1;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
            '<button class="il-add-type" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="border-top:1px solid #eee;padding-top:16px">' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' +
            esc(t('tagsSection')) + ' <span style="color:#aaa">(' + (CFG.siteTags||[]).length + ')</span></label>' +
          '<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#666">' +
            esc(t('tagsHint')) +
          '</div>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:8px;min-height:40px">' +
            (tagChips || '<div style="color:#888;font-size:13px">' + esc(t('noTags')) + '</div>') +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<input class="il-new-tag" placeholder="' + esc(t('newTagPh')) + '" style="flex:1;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
            '<button class="il-add-tag" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
          '</div>' +
        '</div>';

      function wire(){
        box.querySelectorAll('.il-type-label').forEach(inp => {
          inp.onchange = () => {
            const idx = +inp.dataset.idx;
            const val = inp.value.trim();
            if (!val){ toast(t('typeInvalid')); inp.value = CFG.siteTypes[idx].label; return; }
            CFG.siteTypes[idx].label = val;
            saveCfg(CFG);
          };
        });
        box.querySelectorAll('.il-type-del').forEach(btn => {
          btn.onclick = () => {
            const idx = +btn.dataset.idx;
            const tt = CFG.siteTypes[idx];
            if (!tt || tt.builtin) return;
            const affected = CFG.sites.filter(s => s.type === tt.id).length;
            const msg = t('deleteTypeConfirm').replace('{X}', tt.label).replace('{N}', affected);
            if (!confirm(msg)) return;
            CFG.sites.forEach(s => { if (s.type === tt.id) s.type = ''; });
            CFG.siteTypes.splice(idx, 1);
            saveCfg(CFG);
            toast(t('typeDeleted').replace('{X}', tt.label).replace('{N}', affected), 2400);
            render();
          };
        });
        const addTypeBtn = box.querySelector('.il-add-type');
        if (addTypeBtn) addTypeBtn.onclick = () => {
          const inp = box.querySelector('.il-new-type');
          const label = inp.value.trim();
          if (!label){ toast(t('typeInvalid')); return; }
          const exists = (CFG.siteTypes || []).some(tt => tt.label.toLowerCase() === label.toLowerCase());
          if (exists){ toast(t('typeAlreadyExists')); return; }
          const slug = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
            .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || ('t-' + Date.now().toString(36));
          if ((CFG.siteTypes || []).some(tt => tt.id === slug)){
            CFG.siteTypes.push({ id: 't-' + Date.now().toString(36), label: label });
          } else {
            CFG.siteTypes.push({ id: slug, label: label });
          }
          saveCfg(CFG);
          render();
        };
        box.querySelectorAll('.il-tag-del').forEach(btn => {
          btn.onclick = () => {
            const idx = +btn.dataset.idx;
            const tg = CFG.siteTags[idx];
            if (tg == null) return;
            const affected = CFG.sites.filter(s => (s.tags || []).includes(tg)).length;
            const msg = t('deleteTagConfirm').replace('{X}', tg).replace('{N}', affected);
            if (!confirm(msg)) return;
            CFG.sites.forEach(s => { s.tags = (s.tags || []).filter(x => x !== tg); });
            (CFG.customCatalog || []).forEach(it => {
              it.tags = (it.tags || []).filter(x => x !== tg);
            });
            CFG.siteTags.splice(idx, 1);
            saveCfg(CFG);
            toast(t('tagDeleted').replace('{X}', tg).replace('{N}', affected), 2400);
            render();
          };
        });
        const addTagBtn = box.querySelector('.il-add-tag');
        if (addTagBtn) addTagBtn.onclick = () => {
          const inp = box.querySelector('.il-new-tag');
          const tag = inp.value.trim();
          if (!tag){ toast(t('tagInvalid')); return; }
          if ((CFG.siteTags || []).includes(tag)){ toast(t('tagAlreadyExists')); return; }
          CFG.siteTags.push(tag);
          CFG.siteTags.sort();
          saveCfg(CFG);
          render();
        };
      }

      return { html, wire };
    }

    const inner = activeCatalogSub === 'types' ? renderCatalogTypes() : renderCatalogMedia();
    const html = subTabsHTML + inner.html;

    function wire(){
      box.querySelectorAll('.il-cat-subtab').forEach(b => {
        b.onclick = () => { activeCatalogSub = b.dataset.subtab; render(); };
      });
      inner.wire();
    }

    return { html, wire };
  }

  function renderPendientesTab(){
    const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
    const noLeidas = CFG.readLater.filter(r => !r.read);
    const leidas   = CFG.readLater.filter(r => r.read);

    function fila(r, esLeida){
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #eee' +
        (esLeida ? ';opacity:.55' : '') + '">' +
          '<div style="flex:1;min-width:0">' +
            '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" ' +
              'style="color:#d32f2f;text-decoration:none;font-weight:bold;font-size:14px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
              (esLeida ? ';text-decoration:line-through' : '') + '">' + esc(r.title || r.url) + '</a>' +
            '<div style="font-size:11px;color:#888;margin-top:2px">' +
              esc(r.domain || '') + ' · ' + esc((r.date || '').slice(0,10)) +
              (esLeida && r.readAt ? ' · ✓ ' + esc(r.readAt.slice(0,10)) : '') +
            '</div>' +
          '</div>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-toggle" title="' + esc(esLeida ? t('markUnread') : t('markRead')) + '" ' +
            'style="border:1px solid #0a7d00;background:#fff;color:#0a7d00;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">' +
            (esLeida ? '↺' : '✓') + '</button>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-del" title="' + esc(t('remove')) + '" ' +
            'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✕</button>' +
        '</div>';
    }

    const rowsNoLeidas = noLeidas.map(r => fila(r, false)).join('');
    const rowsLeidas   = leidas.map(r => fila(r, true)).join('');

    const html =
      '<div style="margin-bottom:14px">' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;max-height:400px;overflow:auto">' +
          (rowsNoLeidas || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noReadLater')) + '</div>') +
        '</div>' +
      '</div>' +
      (keepRead && leidas.length ?
        '<div style="margin-bottom:14px">' +
          '<div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' +
            esc(t('readItems')) + ' (' + leidas.length + ')</div>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;max-height:200px;overflow:auto;background:#fafafa">' +
            rowsLeidas +
          '</div>' +
        '</div>'
        : '') +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<label style="font-size:12px;color:#666;display:flex;align-items:center;gap:6px;cursor:pointer">' +
          '<input type="checkbox" class="il-keep-read"' + (keepRead ? ' checked' : '') + '>' +
          esc(t('keepReadItems')) +
        '</label>' +
        (keepRead && leidas.length ?
          '<button class="il-clear-read" style="padding:6px 12px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;color:#c00">' +
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
        if (!chk.checked && CFG.readLater.some(r => r.read)){
          CFG.readLater = CFG.readLater.filter(r => !r.read);
          saveCfg(CFG);
          notifyLaterChanged();
        }
        render();
      };
      const clr = box.querySelector('.il-clear-read');
      if (clr) clr.onclick = () => {
        if (!confirm(t('clearReadConfirm'))) return;
        CFG.readLater = CFG.readLater.filter(r => !r.read);
        saveCfg(CFG);
        notifyLaterChanged();
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
        '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' + esc(l.label) + '</label>' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px">' + rows + '</div>' +
      '</div>';
    }).join('');

    const html =
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' + esc(t('dictMode')) + '</label>' +
        '<select class="il-dict-mode" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px;width:100%">' +
          '<option value="direct"' + (CFG.dict.mode === 'direct' ? ' selected' : '') + '>' + esc(t('dictModeDirect')) + '</option>' +
          '<option value="popup"' + (CFG.dict.mode === 'popup' ? ' selected' : '') + '>' + esc(t('dictModePopup')) + '</option>' +
        '</select>' +
      '</div>' +
      blocks +
      '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#666">' +
        esc(t('dictUrlHint')) +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<input class="il-dict-new-name" placeholder="' + esc(t('dictName')) + '" style="flex:1;min-width:120px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<input class="il-dict-new-url" placeholder="' + esc(t('dictUrl')) + '" style="flex:2;min-width:200px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<select class="il-dict-new-lang" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          langs.map(l => '<option value="' + l.code + '">' + l.code.toUpperCase() + '</option>').join('') +
        '</select>' +
        '<button class="il-dict-add" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
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
      '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0">' +
        '<div style="flex:1;font-size:13px">' + esc(svc.nombre) + '</div>' +
        '<div style="flex:2;font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(svc.plantilla) + '">' + esc(svc.plantilla) + '</div>' +
        '<button data-id="' + esc(svc.id) + '" class="il-svc-del" title="' + esc(t('serviciosQuitar')) +
          '" aria-label="' + esc(t('serviciosQuitar')) + '" ' +
          'style="border:none;background:transparent;cursor:pointer;color:#c00;font-size:12px;padding:2px 6px">🗑</button>' +
      '</div>'
    ).join('');

    const html =
      '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:12px;margin-bottom:16px;' +
        'font-size:12px;color:#666;line-height:1.6">' + esc(t('serviciosAyuda')) + '</div>' +
      '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;margin-bottom:16px">' +
        (filas || '<div style="padding:8px 0;font-size:13px;color:#999">' + esc(t('serviciosVacio')) + '</div>') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        '<input class="il-svc-nombre" placeholder="' + esc(t('serviciosNombre')) + '" ' +
          'style="flex:1;min-width:120px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<input class="il-svc-plantilla" placeholder="https://…{url}" ' +
          'style="flex:2;min-width:200px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<button class="il-svc-add" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' +
          esc(t('add')) + '</button>' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:16px;cursor:pointer">' +
        '<input type="checkbox" class="il-svc-fab"' + (CFG.serviciosFab && CFG.serviciosFab.oculto ? '' : ' checked') + '> ' +
        esc(t('serviciosFab')) +
      '</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="il-svc-import" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' +
          esc(t('serviciosImportar')) + '</button>' +
        '<button class="il-svc-export" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer"' +
          (servicios.length ? '' : ' disabled') + '>' + esc(t('serviciosExportar')) + '</button>' +
      '</div>';

    function refrescarFab(){
      const f = document.getElementById('il-servicios-fab'); if (f) f.remove();
      crearFabServicios();
      repositionStackFABs();
    }

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
        return '<em style="color:#999">' + esc(t('shortcutEmpty')) + '</em>';
      }
      return keys.map(k =>
        '<kbd style="display:inline-block;padding:2px 7px;border:1px solid #ccc;border-radius:4px;' +
        'background:#f7f7f7;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;margin:0 4px 0 0">' +
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
        ? '<em style="color:#d32f2f">' + esc(t('shortcutCapture')) + '</em>'
        : keysHTML(keys);
      return '<div class="il-sc-row" data-scope="' + scope + '" data-action="' + action + '" ' +
        'style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0">' +
        '<div style="flex:1;font-size:13px">' + esc(shortcutActionLabel(action)) + '</div>' +
        '<div style="flex:1;text-align:right">' + display + '</div>' +
        (isReserved
          ? '<span style="font-size:11px;color:#999;min-width:180px">' + esc(t('shortcutReservedNote')) + '</span>'
          : '<button class="il-sc-edit" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✏️</button>' +
            '<button class="il-sc-del" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">🗑</button>'
        ) +
      '</div>';
    }

    const readerActions = Object.keys(DEFAULT_CFG.shortcuts.reader);
    const globalActions = Object.keys(DEFAULT_CFG.shortcuts.global);

    const html =
      '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:12px;' +
        'margin-bottom:16px;font-size:12px;color:#555;line-height:1.7">' +
        '<strong>' + esc(t('shortcutNoteTitle')) + '</strong><br>' +
        '• ' + esc(t('shortcutNoteReader')) + '<br>' +
        '• ' + esc(t('shortcutNoteGlobal')) + '<br>' +
        '• ' + esc(t('shortcutNoteCapture')) + '<br>' +
        '• ' + esc(t('shortcutReservedNote')) +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">' +
        '<button class="il-sc-reset" style="padding:6px 12px;border:1px solid #ccc;background:#fff;' +
          'border-radius:6px;cursor:pointer;font-size:12px;color:#c00">' + esc(t('shortcutReset')) + '</button>' +
      '</div>' +
      '<div style="margin-bottom:22px">' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:#666;text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutReader')) + '</h3>' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:0 12px">' +
          readerActions.map(a => rowHTML('reader', a)).join('') +
        '</div>' +
      '</div>' +
      '<div>' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:#666;text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutGlobal')) + '</h3>' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:0 12px">' +
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

  function renderGeneralTab(){
    const html =
      '<div style="margin-bottom:18px">' +
        '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' + esc(t('language')) + '</label>' +
        '<select class="il-set-lang-app" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          '<option value="es"' + (CFG.lang==='es'?' selected':'') + '>Español</option>' +
          '<option value="gl"' + (CFG.lang==='gl'?' selected':'') + '>Galego</option>' +
          '<option value="ca"' + (CFG.lang==='ca'?' selected':'') + '>Català</option>' +
          '<option value="en"' + (CFG.lang==='en'?' selected':'') + '>English</option>' +
          '<option value="eu"' + (CFG.lang==='eu'?' selected':'') + '>Euskara</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:18px;padding:14px;border:2px solid ' + (CFG.readerAutoAll ? '#43a047' : '#ccc') + ';border-radius:8px;background:' + (CFG.readerAutoAll ? '#e8f5e9' : '#fafafa') + '">' +
        '<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">' +
          '<input type="checkbox" class="il-set-auto-all"' + (CFG.readerAutoAll ? ' checked' : '') + ' style="margin-top:3px;width:18px;height:18px;cursor:pointer;flex:0 0 auto">' +
          '<span>' +
            '<span style="display:block;font-weight:bold;font-size:14px;color:' + (CFG.readerAutoAll ? '#1b5e20' : '#222') + '">' +
              (CFG.readerAutoAll ? '🟢 ACTIVADO — ' : '⚪ DESACTIVADO — ') +
              esc(t('readerAutoAllLabel')) +
            '</span>' +
            '<span style="display:block;font-size:12px;color:#555;margin-top:4px">' + esc(t('readerAutoAllHint')) + '</span>' +
          '</span>' +
        '</label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #eee;padding-top:14px">' +
        '<button class="il-set-export" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' + esc(t('exportBtn')) + '</button>' +
        '<button class="il-set-import" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' + esc(t('importBtn')) + '</button>' +
        '<button class="il-set-reset"  style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;color:#c00;margin-left:auto">' + esc(t('resetBtn')) + '</button>' +
      '</div>';

    function wire(){
      const appLangSel = box.querySelector('.il-set-lang-app');
      if (appLangSel) appLangSel.onchange = e => {
        const newLang = e.target.value;
        if (DEFAULT_SITE_TYPES[newLang]){
          const map = new Map(DEFAULT_SITE_TYPES[newLang].map(tt => [tt.id, tt.label]));
          (CFG.siteTypes || []).forEach(tt => {
            if (tt.builtin && map.has(tt.id)) tt.label = map.get(tt.id);
          });
        }
        CFG.lang = newLang;
        saveCfg(CFG);
        render();
        const fab = document.getElementById('il-fab');
        if (fab){ fab.title = t('fabTitle') + '\n' + t('fabHidden'); }
        const sfab = document.getElementById('il-settings-fab');
        if (sfab) sfab.title = t('settingsFabTitle');
        const afab = document.getElementById('il-add-fab');
        if (afab) afab.title = t('addFabTitle');
      };

      const autoAllChk = box.querySelector('.il-set-auto-all');
      if (autoAllChk) autoAllChk.onchange = () => {
        CFG.readerAutoAll = autoAllChk.checked;
        saveCfg(CFG);
        paintReaderFAB();
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
      '<div style="display:flex;gap:4px;border-bottom:1px solid #eee;margin-bottom:18px;flex-wrap:wrap">' +
        tabBtn('sites', t('sites')) +
        tabBtn('catalog', t('catalog')) +
        tabBtn('pendientes', t('pendientes')) +
        tabBtn('dict', t('dictionaries')) +
        tabBtn('servicios', t('abrirEn')) +
        tabBtn('shortcuts', t('shortcuts')) +
        tabBtn('general', t('settings')) +
      '</div>';

    const headerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<h2 style="margin:0;font-size:20px">' + esc(t('settings')) + '</h2>' +
        '<button class="il-set-close" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' + esc(t('close')) + '</button>' +
      '</div>';

    let payload;
    if (activeSection === 'sites')         payload = renderSitesTab();
    else if (activeSection === 'catalog')  payload = renderCatalogTab();
    else if (activeSection === 'pendientes') payload = renderPendientesTab();
    else if (activeSection === 'dict')       payload = renderDictTab();
    else if (activeSection === 'servicios')  payload = renderServiciosTab();
    else if (activeSection === 'shortcuts')  payload = renderShortcutsTab();
    else                                     payload = renderGeneralTab();

    box.innerHTML = headerHTML + tabsHTML + payload.html;

    box.querySelector('.il-set-close').onclick = closeSettings;
    box.querySelectorAll('.il-set-tab').forEach(b => {
      b.onclick = () => { activeSection = b.dataset.tab; render(); };
    });

    payload.wire();
  }

  render();
}

