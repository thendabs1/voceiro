// Lo que el panel de consultas necesita de la lista de deportes (front/app/14-deportes.js).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tokenizeQuery, normalize } from '../../shared/parser.js';
import { AMBITOS, leerConsultaCalendario } from '../../shared/calendario/consulta.js';
import { PREFIJOS_CONSULTAS, MOTOR, admiteConsultaMotor } from '../../shared/consultas/registro.js';

const leer = n => readFileSync(new URL(`../../front/app/${n}`, import.meta.url), 'utf8');
const calendario = leer('14-calendario.js');

export const codigoDeportes = leer('14-accesos.js') + '\n' + leer('14-deportes.js');
export const CAL_DEPORTES = runInNewContext(calendario.match(/const CAL_DEPORTES = .*?;/s)[0] + '\nCAL_DEPORTES');
export const stubsDeportes = () => ({
  AMBITOS, CAL_DEPORTES, PREFIJOS_CONSULTAS, MOTOR, admiteConsultaMotor, leerConsultaCalendario, tokenizeQuery, normalize, window: { scrollTo() {} },
  CAL_NOMBRES_DEPORTE: { futbol: 'calFutbol', baloncesto: 'calBaloncesto', motor: 'calMotor', tenis: 'calTenis', atletismo: 'calAtletismo' },
  calNombreCompeticion: c => AMBITOS[c]?.nombre || AMBITOS[c]?.noticias?.[0] || c,
  calPreferencias: () => null, calPedir: async () => { throw new Error('sin red'); }, AbortController,
  partirConsulta: raw => {
    const tk = tokenizeQuery(raw).find(x => x.resto);
    if (!tk) return { antes: raw, consulta: '' };
    const linea = raw.trimEnd();
    return { antes: linea.slice(0, linea.length - tk.raw.length), consulta: tk.raw };
  },
});
