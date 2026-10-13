/* ============================================================
   2. SERVICIOS EXTERNOS («Abrir en…»)
   ------------------------------------------------------------
   Lista configurable de servicios a los que mandar la página que
   se está leyendo, como los diccionarios. Viene vacía: cada
   persona añade los suyos en Ajustes › Abrir en…, a mano o
   importando una lista en JSON.
   Plantilla: una dirección https:// con {url} (la de la página,
   tal cual) o {url_cod} (codificada).
   ============================================================ */
const SERVICIOS_MAX = 30;

function plantillaServicioValida(p){
  p = String(p || '').trim();
  return /^https:\/\/\S+$/i.test(p) && /\{url(_cod)?\}/.test(p);
}

// Deja solo servicios válidos, sin plantillas repetidas (gana el primero).
function normalizarServicios(arr){
  const vistas = new Set();
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach(s => {
    if (!s || typeof s !== 'object') return;
    const nombre = String(s.nombre || '').trim().slice(0, 60);
    const plantilla = String(s.plantilla || '').trim();
    if (!nombre || !plantillaServicioValida(plantilla) || vistas.has(plantilla)) return;
    vistas.add(plantilla);
    out.push({
      id: (typeof s.id === 'string' && s.id) ? s.id : 'svc-' + Math.random().toString(36).slice(2, 9),
      nombre,
      plantilla
    });
  });
  return out.slice(0, SERVICIOS_MAX);
}

function serviciosConfigurados(){
  return Array.isArray(CFG.servicios) ? CFG.servicios : [];
}

function urlEnServicio(svc, url){
  return svc.plantilla
    .replace(/\{url_cod\}/g, encodeURIComponent(url))
    .replace(/\{url\}/g, url);
}

function abrirEnServicio(svc){
  const url = location.href;
  if (!svc || !/^https?:/i.test(url)) return;
  const destino = urlEnServicio(svc, url);
  if (!/^https:\/\//i.test(destino)) return;
  window.open(destino, '_blank', 'noopener,noreferrer');
}

// Añade los servicios de una lista importada; los repetidos se ignoran.
// Acepta { servicios: [...] } o directamente el array. Devuelve cuántos
// se añadieron, o -1 si el formato no vale.
function importarServicios(data){
  const lista = Array.isArray(data) ? data : (data && data.servicios);
  if (!Array.isArray(lista)) return -1;
  const antes = serviciosConfigurados().length;
  CFG.servicios = normalizarServicios(serviciosConfigurados().concat(lista));
  saveCfg(CFG);
  return CFG.servicios.length - antes;
}

