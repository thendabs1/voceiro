// Fichas por sesión: los identificadores de equipos conservan su pintado.
const idResultadosMotorValido = id => /^(openf1:resultados\/f1|motogp:resultados\/moto(gp|2|3))$/.test(id || '');
const idSesionMotorValido = id => /^openf1:sesion\/20\d{2}\/[1-9]\d{0,7}$/.test(id || '')
  || /^motogp:sesion\/(moto[23]\/)?20\d{2}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id || '');
const notaFechaMotor = id => idResultadosMotorValido(id)
  ? `<p class="consulta-nota">${escapeHtml(t(id.startsWith('openf1:') ? 'conMotorFechaF1' : 'conMotorFechaMoto'))}</p>` : '';
const CONDICIONES_MOTOR = { retirada: 'conMotorRetirada', 'no salió': 'conMotorNoSalio', descalificado: 'conMotorDescalificado',
  'no clasificado': 'conMotorNoClasificado' };
const condicionMotor = c => Object.hasOwn(CONDICIONES_MOTOR, c) ? t(CONDICIONES_MOTOR[c]) : c || '';

function fichaSesionMotor(f){
  const valor = v => escapeHtml(v ?? '—');
  const tiempo = v => Array.isArray(v) ? v.map((x, i) => `Q${i + 1}: ${x ?? '—'}`).join(' · ') : v;
  const diferencia = v => v && typeof v === 'object' && !Array.isArray(v)
    ? v.vueltas != null && String(v.vueltas) !== '0'
      ? t(String(v.vueltas) === '1' ? 'conMotorVueltas1' : 'conMotorVueltas', { n: v.vueltas }) : v.tiempo : tiempo(v);
  const filas = f.filas || [];
  const cols = ['conMotorPosicion', 'conMotorDorsal', 'conMotorPiloto', 'conColEquipo', 'conMotorVueltasCol',
    f.competicion === 'f1' ? 'conMotorTiempoSegundos' : 'conMotorTiempo', f.competicion === 'f1' ? 'conMotorDiferenciaSegundos' : 'conMotorDiferencia', 'conColPts', 'conMotorCondicion'];
  return { titulo: [f.gp?.nombre, f.sesion?.nombre].filter(Boolean).join(' · '),
    linea: [f.categoria, f.temporada, fechaPartidoConsulta(f.inicio), estadoTextoPartido(f.estado)].filter(Boolean).join(' · '),
    cuerpo: filas.length ? `<div class="consulta-tabla-scroll"><table class="consulta-tabla consulta-motor"><thead><tr>${cols.map(c => `<th scope="col">${escapeHtml(t(c).split('|')[0])}</th>`).join('')}</tr></thead><tbody>${filas.map(r => `<tr${claseMarcada(casaEquipo(r.piloto) || casaEquipo(r.equipo))}>
      <td>${valor(r.posicion)}</td><td>${valor(r.dorsal)}</td><td>${r.piloto == null ? '—' : equipoConsulta(r.piloto)}</td><td>${valor(r.equipo)}</td>
      <td>${valor(r.vueltas)}</td><td>${valor(tiempo(r.tiempo))}</td><td>${valor(diferencia(r.diferencia))}</td><td>${valor(r.puntos)}</td><td>${valor(condicionMotor(r.condicion))}</td></tr>`).join('')}</tbody></table></div>`
      : msgConsulta('conMotorSinResultado'),
  };
}
function resultadosMotor(f){
  const grupos = new Map();
  for (const p of f.partidos || []) {
    const clave = p.gp?.id;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }
  return { titulo: CONSULTA_DEPORTES[f.competicion] || f.competicion, linea: tn('conMotorSesiones', f.partidos?.length || 0),
    cuerpo: [...grupos.values()].map(lista => `<section>${lista[0].gp?.nombre ? `<p class="consulta-sub">${escapeHtml(lista[0].gp.nombre)}</p>` : ''}<ul class="consulta-lista">${lista.map(p => `<li>${
      idSesionMotorValido(p.id) ? botonConsulta('partido', p.sesion?.nombre || t('conMotorSesion'), ` data-id="${escapeHtml(p.id)}"`) : escapeHtml(p.sesion?.nombre || t('conMotorSesion'))
    } <span class="consulta-estado">${escapeHtml([fechaPartidoConsulta(p.inicio), p.estado === 'desconocido' ? '' : estadoTextoPartido(p.estado)].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul></section>`).join('') };
}

VISTAS_CONSULTA.sesion_motor = { idValido: idSesionMotorValido, ficha: fichaSesionMotor, resultados: resultadosMotor,
  admiteResultados: f => ['f1', 'motogp', 'moto2', 'moto3'].includes(f.competicion) };
