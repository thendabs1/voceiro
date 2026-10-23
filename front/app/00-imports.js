
/* ═══════════════════════════════════════════════════════════════
   IMPORTS COMPARTIDOS
   El parser vive en shared/parser.js y se copia a public/parser.js
   (mismo origen que este HTML, servido por GitHub Pages).   Fuente única para frontend y worker. No duplicar.
   ═══════════════════════════════════════════════════════════════ */
import {
  parseQuery,
  buildFtsQuery,
  parseRelativeDate,
  normalize,
  normStrict,
  normDomain,
  tokenizeQuery,
} from './parser.js';
// Núcleo del buscador (shared/busqueda/): una sola definición de qué casa.
import { interpretarConsulta, paraArchivo, paraPrensa } from './busqueda/consulta.js';
import { palabrasDe, rangosResaltado } from './busqueda/texto.js';
import { compilarTemas, temasQueCasan, compiladoDeTemas, etiquetaVisible } from './busqueda/temas.js';
import { comparador } from './busqueda/orden.js';
// Datos compartidos con el lector (shared/sync/): una regla de fusión.
import {
  normalizeUrlForMatch, fusionarPendientes, fusionarPerfil, limpiarPerfil,
  fusionarLeidas, fusionarModos, masReciente, huella, huellaModo,
  CAMPOS_PERFIL, LEIDAS_MAX, limpiarColores, CLAVES_COLORES,
} from './sync/fusion.js';
import { paletaPersonalizada, contraste, VARS_PERSONALIZADAS } from './tema/personalizado.js';
// Sincronización entre dispositivos (cliente y código; servidor: workers/cf-sync).
import { crearCliente, SERVIDORES_SYNC } from './sync/cliente.js';
import { generarCodigo, limpiarCodigo, formatearCodigo } from './sync/cripto.js';
// El tiempo (eltiempo:): búsqueda de municipios; la lista se importa al usarla.
import { indexar, sugerirMunicipios, municipiosExactos, provinciaDe } from './tiempo/lugares.js';
import {
  PESO, comunidadDeZona, zonaHorariaAviso, empezado,
  filtrarAvisos, agruparAvisos,
} from './tiempo/avisos.js';

import { I18N, traducir } from './idiomas/index.js';
