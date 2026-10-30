// Nombres de presentación de deportes. Las fuentes mandan sus nombres en inglés,
// con patrocinio y a veces en mayúsculas; aquí se dan limpios y traducidos. La
// sesión se traduce por su código (agenda.tipo_sesion), nunca por su texto; el
// GP, por el lugar que se lee en su nombre. Lo desconocido queda como llega.

const n = (es, gl, ca, eu, en) => ({ es, gl, ca, eu, en });
const LIBRES = i => n(`Libres ${i}`, `Libres ${i}`, `Lliures ${i}`, `Libreak ${i}`, `Practice ${i}`);
const CLASIFICACION = n('Clasificación', 'Clasificación', 'Classificació', 'Sailkapena', 'Qualifying');
const CLASIFICACION_SPRINT = n('Clasificación sprint', 'Clasificación sprint', 'Classificació esprint', 'Sprint sailkapena', 'Sprint qualifying');
const SPRINT = n('Sprint', 'Sprint', 'Esprint', 'Sprint', 'Sprint');
const CARRERA = n('Carrera', 'Carreira', 'Cursa', 'Lasterketa', 'Race');
// F1 oficial (shortName), ESPN F1 (abreviatura) y MotoGP (shortname). Los mismos
// códigos significan lo mismo en las tres en un GP; los tests no se importan
// (allí FP1 es «Día 1»). Véase docs/sesiones-motor-tenis-2026-10-30.md.
export const SESIONES = {
  FP1: LIBRES(1), FP2: LIBRES(2), FP3: LIBRES(3),
  Qualifying: CLASIFICACION, Qual: CLASIFICACION,
  'Sprint Q': CLASIFICACION_SPRINT, SS: CLASIFICACION_SPRINT,
  Sprint: SPRINT, SR: SPRINT, SPR: SPRINT,
  Race: CARRERA, RAC: CARRERA, RAC2: CARRERA,
  PR: n('Práctica', 'Práctica', 'Pràctica', 'Praktika', 'Practice'),
  Q1: n('Clasificación Q1', 'Clasificación Q1', 'Classificació Q1', 'Q1 sailkapena', 'Qualifying Q1'),
  Q2: n('Clasificación Q2', 'Clasificación Q2', 'Classificació Q2', 'Q2 sailkapena', 'Qualifying Q2'),
  WUP: n('Warm Up', 'Warm Up', 'Warm Up', 'Warm Up', 'Warm-up'),
};
export const nombresSesion = tipo => typeof tipo === 'string' && Object.hasOwn(SESIONES, tipo) ? SESIONES[tipo] : null;

// Lugar del nombre → nombre del GP en cada idioma (F1 2026, MotoGP 2026–2027) y
// del rally (WRC). Clave: el lugar en minúsculas, sin tildes y con espacios
// simples. Fuentes y dudas: docs/nombres-gp-rallies-2026-10-30.md (Codex).
export const LUGARES = {
  "abu dhabi": n("GP de Abu Dabi", "GP de Abu Dabi", "GP d'Abu Dhabi", "Abu Dhabiko Sari Nagusia", "Abu Dhabi GP"),
  "aragon": n("GP de Aragón", "GP de Aragón", "GP d'Aragó", "Aragoiko Sari Nagusia", "Aragon GP"),
  "argentina": n("GP de Argentina", "GP da Arxentina", "GP de l'Argentina", "Argentinako Sari Nagusia", "Argentine GP"),
  "australia": n("GP de Australia", "GP de Australia", "GP d'Austràlia", "Australiako Sari Nagusia", "Australian GP"),
  "australian": n("GP de Australia", "GP de Australia", "GP d'Austràlia", "Australiako Sari Nagusia", "Australian GP"),
  "austria": n("GP de Austria", "GP de Austria", "GP d'Àustria", "Austriako Sari Nagusia", "Austrian GP"),
  "austrian": n("GP de Austria", "GP de Austria", "GP d'Àustria", "Austriako Sari Nagusia", "Austrian GP"),
  "azerbaijan": n("GP de Azerbaiyán", "GP de Acerbaixán", "GP d'Azerbaidjan", "Azerbaijango Sari Nagusia", "Azerbaijan GP"),
  "bahrain": n("GP de Baréin", "GP de Bahrein", "GP de Bahrain", "Bahraingo Sari Nagusia", "Bahrain GP"),
  "barcelona": n("GP de Barcelona", "GP de Barcelona", "GP de Barcelona", "Bartzelonako Sari Nagusia", "Barcelona GP"),
  "barcelona-catalunya": n("GP de Barcelona-Cataluña", "GP de Barcelona-Cataluña", "GP de Barcelona-Catalunya", "Bartzelona-Kataluniako Sari Nagusia", "Barcelona-Catalunya GP"),
  "belgian": n("GP de Bélgica", "GP de Bélxica", "GP de Bèlgica", "Belgikako Sari Nagusia", "Belgian GP"),
  "brazil": n("GP de Brasil", "GP do Brasil", "GP del Brasil", "Brasilgo Sari Nagusia", "Brazilian GP"),
  "british": n("GP de Gran Bretaña", "GP de Gran Bretaña", "GP de la Gran Bretanya", "Britainia Handiko Sari Nagusia", "British GP"),
  "canadian": n("GP de Canadá", "GP do Canadá", "GP del Canadà", "Kanadako Sari Nagusia", "Canadian GP"),
  "catalonia": n("GP de Cataluña", "GP de Cataluña", "GP de Catalunya", "Kataluniako Sari Nagusia", "Catalan GP"),
  "catalunya": n("GP de Cataluña", "GP de Cataluña", "GP de Catalunya", "Kataluniako Sari Nagusia", "Catalan GP"),
  "chinese": n("GP de China", "GP da China", "GP de la Xina", "Txinako Sari Nagusia", "Chinese GP"),
  "czechia": n("GP de la República Checa", "GP de Chequia", "GP de Txèquia", "Txekiako Sari Nagusia", "Czech GP"),
  "dutch": n("GP de los Países Bajos", "GP dos Países Baixos", "GP dels Països Baixos", "Herbehereetako Sari Nagusia", "Dutch GP"),
  "france": n("GP de Francia", "GP de Francia", "GP de França", "Frantziako Sari Nagusia", "French GP"),
  "germany": n("GP de Alemania", "GP de Alemaña", "GP d'Alemanya", "Alemaniako Sari Nagusia", "German GP"),
  "great britain": n("GP de Gran Bretaña", "GP de Gran Bretaña", "GP de la Gran Bretanya", "Britainia Handiko Sari Nagusia", "British GP"),
  "hungarian": n("GP de Hungría", "GP de Hungría", "GP d'Hongria", "Hungariako Sari Nagusia", "Hungarian GP"),
  "hungary": n("GP de Hungría", "GP de Hungría", "GP d'Hongria", "Hungariako Sari Nagusia", "Hungarian GP"),
  "indonesia": n("GP de Indonesia", "GP de Indonesia", "GP d'Indonèsia", "Indonesiako Sari Nagusia", "Indonesian GP"),
  "italian": n("GP de Italia", "GP de Italia", "GP d'Itàlia", "Italiako Sari Nagusia", "Italian GP"),
  "italy": n("GP de Italia", "GP de Italia", "GP d'Itàlia", "Italiako Sari Nagusia", "Italian GP"),
  "japan": n("GP de Japón", "GP do Xapón", "GP del Japó", "Japoniako Sari Nagusia", "Japanese GP"),
  "japanese": n("GP de Japón", "GP do Xapón", "GP del Japó", "Japoniako Sari Nagusia", "Japanese GP"),
  "las vegas": n("GP de Las Vegas", "GP de Las Vegas", "GP de Las Vegas", "Las Vegaseko Sari Nagusia", "Las Vegas GP"),
  "malaysia": n("GP de Malasia", "GP de Malaisia", "GP de Malàisia", "Malaysiako Sari Nagusia", "Malaysian GP"),
  "mexico city": n("GP de Ciudad de México", "GP de Cidade de México", "GP de Ciutat de Mèxic", "Mexiko Hiriko Sari Nagusia", "Mexico City GP"),
  "miami": n("GP de Miami", "GP de Miami", "GP de Miami", "Miamiko Sari Nagusia", "Miami GP"),
  "monaco": n("GP de Mónaco", "GP de Mónaco", "GP de Mònaco", "Monakoko Sari Nagusia", "Monaco GP"),
  "netherlands": n("GP de los Países Bajos", "GP dos Países Baixos", "GP dels Països Baixos", "Herbehereetako Sari Nagusia", "Dutch GP"),
  "portugal": n("GP de Portugal", "GP de Portugal", "GP de Portugal", "Portugalgo Sari Nagusia", "Portuguese GP"),
  "portuguese": n("GP de Portugal", "GP de Portugal", "GP de Portugal", "Portugalgo Sari Nagusia", "Portuguese GP"),
  "qatar": n("GP de Catar", "GP de Qatar", "GP de Qatar", "Qatarko Sari Nagusia", "Qatar GP"),
  "san marino and the rimini riviera": n("GP de San Marino y la Riviera de Rimini", "GP de San Marino e a Riviera de Rímini", "GP de San Marino i la Riviera de Rímini", "San Marinoko eta Riminiko Rivierako Sari Nagusia", "San Marino and Rimini Riviera GP"),
  "sao paulo": n("GP de São Paulo", "GP de São Paulo", "GP de São Paulo", "São Pauloko Sari Nagusia", "São Paulo GP"),
  "saudi arabian": n("GP de Arabia Saudí", "GP de Arabia Saudita", "GP d'Aràbia Saudita", "Saudi Arabiako Sari Nagusia", "Saudi Arabian GP"),
  "singapore": n("GP de Singapur", "GP de Singapur", "GP de Singapur", "Singapurko Sari Nagusia", "Singapore GP"),
  "spain": n("GP de España", "GP de España", "GP d'Espanya", "Espainiako Sari Nagusia", "Spanish GP"),
  "spanish": n("GP de España", "GP de España", "GP d'Espanya", "Espainiako Sari Nagusia", "Spanish GP"),
  "thailand": n("GP de Tailandia", "GP de Tailandia", "GP de Tailàndia", "Thailandiako Sari Nagusia", "Thai GP"),
  "turkish": n("GP de Turquía", "GP de Turquía", "GP de Turquia", "Turkiako Sari Nagusia", "Turkish GP"),
  "united states": n("GP de Estados Unidos", "GP dos Estados Unidos", "GP dels Estats Units", "Ameriketako Estatu Batuetako Sari Nagusia", "United States GP"),
  "valencia": n("GP de Valencia", "GP de Valencia", "GP de València", "Valentziako Sari Nagusia", "Valencia GP"),
};
export const RALLIES = {
  "acropolis greece": n("Rally de la Acrópolis de Grecia", "Rally da Acrópole de Grecia", "Ral·li de l’Acròpolis de Grècia", "Greziako Akropolis Rallya", "Acropolis Rally Greece"),
  "chile biobio": n("Rally de Chile Biobío", "Rally de Chile Biobío", "Ral·li de Xile Biobío", "Txileko Biobío Rallya", "Rally Chile Biobío"),
  "croatia": n("Rally de Croacia", "Rally de Croacia", "Ral·li de Croàcia", "Kroaziako Rallya", "Croatia Rally"),
  "estonia": n("Rally de Estonia", "Rally de Estonia", "Ral·li d'Estònia", "Estoniako Rallya", "Rally Estonia"),
  "finland": n("Rally de Finlandia", "Rally de Finlandia", "Ral·li de Finlàndia", "Finlandiako Rallya", "Rally Finland"),
  "islas canarias": n("Rally de las Islas Canarias", "Rally das Illas Canarias", "Ral·li de les Illes Canàries", "Kanaria Uharteetako Rallya", "Rally Islas Canarias"),
  "islas canarias - rally of spain": n("Rally de las Islas Canarias", "Rally das Illas Canarias", "Ral·li de les Illes Canàries", "Kanaria Uharteetako Rallya", "Rally Islas Canarias"),
  "italia": n("Rally de Italia", "Rally de Italia", "Ral·li d'Itàlia", "Italiako Rallya", "Rally d'Italia"),
  "italia sardegna": n("Rally de Italia-Cerdeña", "Rally de Italia-Sardeña", "Ral·li d'Itàlia-Sardenya", "Sardiniako Rallya", "Rally Italia Sardegna"),
  "japan": n("Rally de Japón", "Rally do Xapón", "Ral·li del Japó", "Japoniako Rallya", "Rally Japan"),
  "monte carlo": n("Rally de Montecarlo", "Rally de Montecarlo", "Ral·li de Montecarlo", "Monte Carloko Rallya", "Monte Carlo Rally"),
  "monte-carlo": n("Rally de Montecarlo", "Rally de Montecarlo", "Ral·li de Montecarlo", "Monte Carloko Rallya", "Monte Carlo Rally"),
  "paraguay": n("Rally de Paraguay", "Rally do Paraguai", "Ral·li del Paraguai", "Paraguaiko Rallya", "Rally del Paraguay"),
  "portugal": n("Rally de Portugal", "Rally de Portugal", "Ral·li de Portugal", "Portugalgo Rallya", "Rally de Portugal"),
  "safari kenya": n("Rally Safari de Kenia", "Rally Safari de Quenia", "Ral·li Safari de Kenya", "Kenyako Safari Rallya", "Safari Rally Kenya"),
  "saudi arabia": n("Rally de Arabia Saudí", "Rally de Arabia Saudita", "Ral·li d'Aràbia Saudita", "Saudi Arabiako Rallya", "Rally Saudi Arabia"),
  "scotland": n("Rally de Escocia", "Rally de Escocia", "Ral·li d'Escòcia", "Eskoziako Rallya", "Rally Scotland"),
  "sweden": n("Rally de Suecia", "Rally de Suecia", "Ral·li de Suècia", "Suediako Rallya", "Rally Sweden"),
  "us": n("Rally de Estados Unidos", "Rally dos Estados Unidos", "Ral·li dels Estats Units", "Ameriketako Estatu Batuetako Rallya", "Rally US"),
};

export const clave = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'das', 'dos', 'of', 'the', 'and']);
// Solo lo que llega todo en mayúsculas («BEIJING», «GRAND PRIX OF THE NETHERLANDS»).
export function enMinusculas(s){
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!/\p{Lu}\p{Lu}/u.test(s) || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\p{L}[\p{L}'’]*/gu, (w, i) => i && MENORES.has(w) ? w : w[0].toUpperCase() + w.slice(1));
}

// MotoGP: «PETRONAS GRAND PRIX OF MALAYSIA»; F1: «Mexico City Grand Prix» (ESPN,
// con patrocinio delante: solo se quitan los observados).
const GP_DE = /\bGRAND PRIX OF (?:THE )?(.+?)\s*$/i, GP = /^(.+?)\s+Grand Prix\s*$/i;
const PATROCINIO_F1 = /^(?:Qatar Airways|Heineken|Aramco|Gulf Air|STC|Crypto\.com|Lenovo|MSC Cruises|Pirelli|Moët & Chandon|AWS|Tag Heuer|Singapore Airlines|Etihad Airways)\s+/i;
// WRC: «FORUM8 Rally Japan», «Rally d'Italia Sardegna», «Safari Rally Kenya».
const PATROCINIO_RALLY = /^(?:FORUM8|EKO|Vodafone|Delfi|Secto|ueno)\s+/i;
const RALLY = /^Rallye?\s+(?:(?:de|del)\s+|d['’])?(.+)$/i, RALLY_DETRAS = /^(.+?)\s+Rally(?:\s+(.+))?$/i;
// WTA: «Toray Pan Pacific Open Tennis - Tokyo, JPN», con la ciudad del lugar.
const SUFIJO = /\s+-\s+([^-]+)$/;

function lugarRally(nombre){
  const limpio = nombre.replace(/^WRC\s+/i, '').replace(/\s+20\d\d$/, '').replace(PATROCINIO_RALLY, '');
  const m = limpio.match(RALLY), d = !m && limpio.match(RALLY_DETRAS);
  return m ? m[1] : d ? [d[1], d[2]].filter(Boolean).join(' ') : '';
}

// Nombres limpios de un evento (objeto de nombres por idioma) o null si no hay
// nada que limpiar. `lugares`: textos del lugar del evento (nombre, municipio).
export function nombresEvento(nombres, lugares = []){
  const original = String(nombres?.und ?? nombres?.es ?? Object.values(nombres || {})[0] ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return null;
  let m = original.match(GP_DE) || original.replace(PATROCINIO_F1, '').match(GP);
  if (m){
    const lugar = clave(m[1]);
    if (Object.hasOwn(LUGARES, lugar)) return LUGARES[lugar];
    // Sin traducción: sin patrocinio y en minúsculas, como lo diría la fuente.
    return { und: original.match(GP_DE) ? 'Grand Prix of ' + enMinusculas(m[1]) : enMinusculas(original) };
  }
  // Un rally solo se traduce si es uno conocido; un rally local queda como está.
  const rally = /\bRallye?\b/i.test(original) && clave(lugarRally(original));
  if (rally && Object.hasOwn(RALLIES, rally)) return RALLIES[rally];
  m = original.match(SUFIJO);
  const ciudad = m && clave(m[1].split(',')[0]);
  if (ciudad && lugares.some(l => clave(String(l ?? '').split(',')[0]) === ciudad)) return { und: original.slice(0, m.index).trim() };
  return null;
}
