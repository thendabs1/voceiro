// Aplica solo lo que cambió en una pestaña. Las otras pestañas pueden haber
// guardado desde que se tomó su copia: se conservan sus cambios independientes.
export function fusionarCambiosCfg(actual, base, nuevo, fusionarPendientes, ahora = Date.now()){
  const igual = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const objeto = x => x && typeof x === 'object' && !Array.isArray(x);
  function aplicar(vivo, antes, despues){
    if (igual(antes, despues)) return vivo;
    if (!objeto(despues)) return structuredClone(despues);
    const out = { ...(objeto(vivo) ? vivo : {}) };
    for (const k of Object.keys(objeto(antes) ? antes : {})){
      if (!Object.hasOwn(despues, k)) delete out[k];
    }
    for (const k of Object.keys(despues)){
      if (['__proto__','prototype','constructor'].includes(k)) continue;
      if (!igual(antes?.[k], despues[k])) out[k] = aplicar(out[k], antes?.[k], despues[k]);
    }
    return out;
  }
  const out = aplicar(actual, base, nuevo);
  if (!igual(base.readLater, nuevo.readLater)){
    const presentes = new Set((nuevo.readLater || []).map(p => p.url));
    const retirados = (base.readLater || []).filter(p => !presentes.has(p.url))
      .map(p => ({ ...p, borrado: true, actualizado: ahora }));
    out.readLater = fusionarPendientes(actual.readLater, [...(nuevo.readLater || []), ...retirados], ahora);
  }
  if (!igual(base.sites, nuevo.sites)){
    const sitios = new Map((actual.sites || []).map(s => [s.domain, s]));
    const antes = new Map((base.sites || []).map(s => [s.domain, s]));
    const despues = new Map((nuevo.sites || []).map(s => [s.domain, s]));
    for (const dominio of antes.keys()) if (!despues.has(dominio)) sitios.delete(dominio);
    for (const [dominio, sitio] of despues){
      if (!igual(antes.get(dominio), sitio)) sitios.set(dominio, aplicar(sitios.get(dominio), antes.get(dominio), sitio));
    }
    out.sites = [...sitios.values()];
  }
  if (!igual(base.leidasParaVoceiro, nuevo.leidasParaVoceiro)){
    const clave = l => l.url + ':' + l.fecha + ':' + !!l.quitar;
    const presentes = new Set((nuevo.leidasParaVoceiro || []).filter(Boolean).map(clave));
    const retirados = new Set((base.leidasParaVoceiro || []).filter(l => l && !presentes.has(clave(l))).map(clave));
    const porClave = new Map();
    for (const l of [...(actual.leidasParaVoceiro || []), ...(nuevo.leidasParaVoceiro || [])]){
      if (l && !retirados.has(clave(l))) porClave.set(clave(l), l);
    }
    out.leidasParaVoceiro = [...porClave.values()].sort((a,b) => a.fecha-b.fecha).slice(-200);
  }
  return out;
}
