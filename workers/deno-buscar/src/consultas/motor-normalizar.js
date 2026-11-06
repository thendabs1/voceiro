const texto = v => typeof v === 'string' && v.trim() ? v.trim().slice(0, 180) : null;
const numero = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const valor = v => numero(v) ?? texto(v);
// Q1/Q2/Q3 conservan su orden y sus huecos: no elegir el mejor tiempo.
const tiempos = v => Array.isArray(v) ? v.slice(0, 3).map(valor) : valor(v);
export const FUENTES_MOTOR = {
  openf1: { nombre: 'OpenF1', url: 'https://openf1.org/', licencia: 'CC BY-NC-SA 4.0',
    licencia_url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  motogp: { nombre: 'MotoGP', url: 'https://www.motogp.com/en/gp-results', licencia: 'Condiciones de MotoGP',
    licencia_url: 'https://www.motogp.com/en/legal-notice' },
};
export const UUID_MOTOR = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const patronMoto = new RegExp(`^motogp:sesion/(20\\d{2})/(${UUID_MOTOR})/(${UUID_MOTOR})$`);
export function leerIdMotor(id) {
  if (id === 'openf1:resultados/f1') return { proveedor: 'openf1', competicion: 'f1', lista: true };
  if (id === 'motogp:resultados/motogp') return { proveedor: 'motogp', competicion: 'motogp', lista: true };
  const f1 = /^openf1:sesion\/(20\d{2})\/([1-9]\d{0,7})$/.exec(id || '');
  if (f1) return { proveedor: 'openf1', competicion: 'f1', temporada: Number(f1[1]), sesion: f1[2] };
  const moto = patronMoto.exec(id || '');
  return moto ? { proveedor: 'motogp', competicion: 'motogp', temporada: Number(moto[1]), evento: moto[2], sesion: moto[3] } : null;
}
export const claveSesionMoto = s => /^(FP|Q)$/.test(s.type) && Number.isInteger(s.number) && s.number > 0 && s.number < 10
  ? s.type + s.number : /^(PR|SPR|WUP|RAC)$/.test(s.type) ? s.type : null;

// OpenF1 no declara estado de sesión: solo es seguro «cancelada» o «aún no empezó».
const estadoF1 = (s, ahora) => s.is_cancelled === true ? 'cancelado'
  : Date.parse(s.date_start) > ahora ? 'programado' : 'desconocido';

export function baseF1(s, gp, ahora) {
  return { vista: 'sesion_motor', id: `openf1:sesion/${s.year}/${s.session_key}`, competicion: 'f1', temporada: numero(s.year),
    inicio: texto(s.date_start), estado: estadoF1(s, ahora),
    estado_original: null, condicion: null,
    referencias_agenda: [{ proveedor: 'formula1', tipo: 'meeting_session_key', id: String(s.session_key) }],
    fuente: FUENTES_MOTOR.openf1,
    gp: { id: String(s.meeting_key), nombre: texto(gp?.meeting_name) },
    sesion: { tipo: texto(s.session_type), numero: null, nombre: texto(s.session_name) }, categoria: 'F1' };
}
export function filasF1(resultados, pilotos) {
  return resultados.map(r => {
    const p = pilotos.find(p => p.driver_number === r.driver_number);
    const condicion = r.dsq === true ? 'descalificado' : r.dns === true ? 'no salió' : r.dnf === true ? 'retirada' : null;
    return { posicion: numero(r.position), dorsal: numero(r.driver_number), piloto: texto(p?.full_name), equipo: texto(p?.team_name),
      vueltas: numero(r.number_of_laps), tiempo: tiempos(r.duration), diferencia: tiempos(r.gap_to_leader), puntos: numero(r.points),
      condicion, condicion_original: r.dsq === true ? 'dsq' : r.dns === true ? 'dns' : r.dnf === true ? 'dnf' : null };
  });
}
export function baseMoto(s, e, temporada) {
  const clave = claveSesionMoto(s);
  return { vista: 'sesion_motor', id: `motogp:sesion/${temporada}/${e.id}/${s.id}`, competicion: 'motogp', temporada,
    // `date` de resultados tiene offset UTC falso: no convertirlo a un instante.
    inicio: null, estado: ({ FINISHED: 'final', 'NOT-STARTED': 'programado', LIVE: 'en_juego', STARTED: 'en_juego',
      CANCELLED: 'cancelado', CANCELED: 'cancelado', POSTPONED: 'aplazado', DELAYED: 'retrasado' })[s.status] || 'desconocido',
    estado_original: texto(s.status), condicion: null,
    referencias_agenda: e.toad_api_uuid ? [
      { proveedor: 'motogp', tipo: 'grand_prix_calendar_id', id: e.toad_api_uuid },
      { proveedor: 'motogp', tipo: 'tipo_sesion', id: clave },
    ] : [], fuente: FUENTES_MOTOR.motogp,
    gp: { id: e.id, nombre: texto(e.name) },
    sesion: { tipo: texto(s.type), numero: numero(s.number), nombre: clave }, categoria: 'MotoGP' };
}
export function filasMoto(d) {
  return d.classification.map(r => ({ posicion: numero(r.position), dorsal: numero(r.rider?.number),
    piloto: texto(r.rider?.full_name), equipo: texto(r.team?.name), vueltas: numero(r.total_laps),
    tiempo: valor(r.time), diferencia: r.gap ? { tiempo: valor(r.gap.first), vueltas: valor(r.gap.lap) } : null, puntos: numero(r.points),
    condicion: r.status === 'OUTSTND' ? 'no clasificado' : null, condicion_original: texto(r.status) }));
}
