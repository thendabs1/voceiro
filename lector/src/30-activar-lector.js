/* ============================================================
   23. ACTIVAR LECTOR
   ============================================================ */
function activateReader(){
  try {
    const ex = currentExtraction();
    let art = extractArticleWithConfig(ex);
    let usedFallback = false;

    // Fallback: si el origen explícito falla, probamos con auto y reabrimos.
    if (!art && ex.mode === 'auto' && currentReaderSource() !== 'auto'){
      art = extractArticleWithConfig(ex, 'auto');
      if (art) usedFallback = true;
    }

    if (!art){
      if (ex.mode === 'selector') toast(t('srcNoCustom'));
      else if (ex.mode === 'all') toast(t('srcNoAll'));
      else {
        const src = currentReaderSource();
        if (src === 'jsonld') toast(t('srcNoJsonld'));
        else if (src === 'readability') toast(t('srcNoReadability'));
        else toast(t('noArticle'));
      }
      return;
    }

    if (usedFallback){
      // El origen elegido no servía: lo dejamos en auto para que el FAB no vuelva a fallar.
      const rule = findSiteRule();
      if (rule && rule.readerSource !== 'auto'){
        rule.readerSource = 'auto';
        saveCfg(CFG);
      }
      __sessionSourceOverride = null;
      toast(t('srcFallbackAuto'), 2200);
    }

    const plain = art.rawHTML ? stripTags(art.rawHTML).trim() : String(art.rawBody || '').trim();
    if (!plain || plain.length < 100){
      if (ex.mode === 'selector') toast(t('srcNoCustom'));
      else if (ex.mode === 'all') toast(t('srcNoAll'));
      else toast(t('noArticle'));
      return;
    }
    openReader(art);
  } catch(e){
    console.error('[Lector Universal]', e);
    toast(t('noArticle'));
  }
}

