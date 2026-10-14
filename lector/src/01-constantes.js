/* ============================================================
   1. CONSTANTES
   ============================================================ */
const SCRIPT_VERSION = '{{VERSION}}';
const READER_SOURCES = ['auto','jsonld','readability','custom'];
// Imágenes del artículo: todas, solo las que traen pie, ninguna. Hay un
// valor para todos los medios (prefs.imagenes) y otro, opcional, por medio.
const IMAGENES = ['todas','conPie','ninguna'];
// Nombres de las redes y servicios de los embebidos (tarjeta con enlace).
const NOMBRES_REDES = { x: 'X', youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram',
                        tiktok: 'TikTok', bluesky: 'Bluesky', facebook: 'Facebook',
                        datawrapper: 'Datawrapper', flourish: 'Flourish', infogram: 'Infogram',
                        genially: 'Genially', tableau: 'Tableau Public', arcgis: 'ArcGIS',
                        googlemaps: 'Google Maps', umap: 'uMap', googlesheets: 'Google Sheets' };
// Qué es el embebido, si se sabe (data-il-clase): sale en la tarjeta.
const CLASES_EMBEBIDO = { tabla: 'tabla', grafico: 'grafico', mapa: 'mapa' };
const SITE_LANGS     = ['auto','es','gl','ca','en','eu','fr','de','it','pt'];
const UI_LANGS       = ['es','gl','ca','en','eu'];
const EXTRACTION_MODES = ['auto','selector','all'];

const SITE_TYPE_IDS = [
  'diario','digital','revista','deportivo','economico',
  'tecnologia','cultural','tv','radio','agencia','otro'
];

const UI = {
  fsMin: 14, fsMax: 32,
  wMin: 480, wMax: 1400, wStep: 40,
  rsvpWPL: 8, rsvpWpmMin: 100, rsvpWpmMax: 1000, rsvpWpmStep: 50,
  fabSize: 52, fabMargin: 24, fabGap: 12,
  extractMinChars: 100
};

// Voceiro. El puente y sus eventos solo existen en su página: en el resto
// de webs, ningún script ajeno puede pedir ni recibir la configuración.
const VOCEIRO_URL = 'https://thendabs1.github.io/voceiro/';
function esVoceiro(){
  return location.origin === 'https://thendabs1.github.io' &&
         /^\/voceiro(\/|$)/.test(location.pathname);
}

