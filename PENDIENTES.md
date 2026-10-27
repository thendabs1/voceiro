# Pendientes

Trabajo sin completar; los manuales de cada componente describen lo que ya
funciona. Las propuestas requieren diseño o validación antes de implementarse.

## Agenda y territorios

- Rediseñar y reactivar el calendario; la conexión del cliente con la API ya
  existe. Retención, retirada, nuevas fuentes y seguimiento se mantienen en
  el [manual de agenda](agenda/README.md#pendiente).
- Correspondencias Kulturklik, más recintos de Madrid, vigencias, relaciones
  meteorológicas y cobertura editorial múltiple:
  [relacionador territorial](shared/territorios/relacionador.md#pendiente).

## Fuentes de noticias: clubes, federaciones y otros emisores

El modelo ya admite `clase`, `sede` y `cobertura` (hasta provincia) y
`medios.categoria_de`; ningún medio los usa aún
([contrato](shared/territorios/relacionador.md#sede-cobertura-explícita-y-clase-del-emisor)).
No dar de alta ningún club, federación ni institución hasta resolver la
activación (tercer punto). La cobertura nunca baja de provincia: la
clasificación por ciudad no es fiable (16 % de sedes resueltas en el sondeo).

- Publicar `clase` y la categoría estructurada en el catálogo, las portadas
  (`cosecha/formatos.py` no lleva territorio ni clase) y las estadísticas, y
  sustituir los troceos del literal de grupo por `« · »`
  (`front/app/16-medios.js`, `14-estadisticas.js`, `17-asistente-modos.js`,
  autocompletado). El literal no cambia: los modos guardados lo usan como
  identidad.
- Datos: cobertura provincial con evidencia para unos 15 diarios (Diario de
  Almería, Cádiz, Sevilla, Sur, Granada Hoy, Málaga Hoy, Diario de León,
  Valladolid, Burgos, Diari de Tarragona, Alicante Plaza, Castellón Plaza,
  Ideal, Heraldo, Hoy). eldiario.es se queda como nacional; sus ediciones
  regionales serían canales. No usar las coberturas con municipio de los
  sondeos (El Correo, ABC).
- Activación de fuentes nuevas (`existente`, `territorio`, `seguimiento`): el
  filtro debe aplicarse antes del cupo y la deduplicación de portadas y de los
  «compartidos» de estadísticas; si no, 200 fuentes alteran lo existente. Hay
  que recuperar el histórico de las fuentes adicionales (hoy solo se relee
  `all`), dar cadencia y umbral de suficiencia por emisor (hoy cinco titulares
  para todos) y medir el recolector antes de crecer.
- Confirmar quién lanza `actualizar.yml` y con qué cadencia: el repositorio
  solo tiene `workflow_dispatch`.
- Selección por territorio (directa, contenida, superior) como operador del
  parser compartido: solo cuando se pida buscar «todo lo de Andalucía».
- Portadas configurables o bajo demanda: aparcado. La opción recomendada es
  ampliar el ensamblado en cliente de `front/app/10-capas.js` (límite de 12
  dominios en filtros explícitos sin grupo, selección guardada como lista de
  dominios para clientes antiguos); medir antes selecciones distintas, bytes y
  tiempos en móvil.
- Atletismo: pedir permiso a la RFEA para su calendario
  ([fuentes](agenda/fuentes.md#atletismo)); World Athletics solo con
  autorización escrita.

## Cosecha y fechas

- Obtener casos reales de medios que fechen noticias con la celebración de un
  evento. Distinguir publicación, actualización, celebración y primera recogida
  antes de cambiar agrupación, estimación, retención o estadísticas. La
  protección de seis horas no identifica el significado de una fecha.
- Revisar procedencia y precisión de las fechas históricas antes de utilizarlas
  en análisis intradiarios. No corregirlas automáticamente ni asumir que toda
  medianoche es inventada. Quedan por contrastar horas sistemáticas de fuentes
  concretas y fechas ISO sin zona; solo modificar reglas con ejemplos reales.
- Verificar la cadencia nocturna del lanzador externo de `actualizar.yml`:
  la nota anterior pedía pasadas a la 01, 02, 04 y 05 de Madrid, pero ese
  lanzador no está en el repositorio y aquí no se acredita su configuración.
- Mejorar el control de actividad con los logs y `runs.intentos` existentes:
  extracción correcta, frescura y periodicidad son señales diferentes. No
  repetir un barrido diario de todos los medios ni retirarlos por el umbral
  genérico de 48 horas del diagnóstico.

## Estadísticas de asuntos

El panel técnico de Resumen y Medios ya está implementado. Asuntos, evidencia
por artículo y comparación entre medios siguen pendientes.

- Unidad: artículo del medio con ID de origen o URL normalizada acreditada.
  Expandir alternativas `a`; un cambio de titular no crea otro artículo.
  Canónicas, AMP y URLs reutilizadas necesitan reglas con evidencia.
- Contar asuntos sobre el último titular observado hasta el corte y conservar
  el texto que justifica cada resultado. El histórico ambiguo no permite
  reconstruir silenciosamente la última versión de un titular.
- Eje temporal: publicación; recogida para retrasos y disponibilidad. Separar
  día sin hora, actualización, fecha sin procedencia, estimación y ausencia.
  Un día de Madrid puede tener 23 o 25 horas; los cortes deben ser equivalentes.
- Objetivo de cuatro cortes diarios, sin horario de producción fijado. Revisar
  hoy y tres días anteriores, conservando revisiones. Una recogida tardía revisa
  el día publicado; no prueba que el panel conociera el artículo entonces.
- Validar frases y expresiones de varias palabras, siglas, idiomas y nombres
  ambiguos con titulares reales. El idioma único del catálogo de medios no
  basta. Piloto inicial: Nacional en castellano. No clasificar sentimiento.
- Para medio y período: U = artículos fechados aptos; N = analizables por el
  método; C = coincidencias. Proporción = C/N; con N=0 es indefinida. Mostrar
  excluidos y motivos. Un hueco de recogida o un idioma no analizado no es cero.
- Crecimiento: media por medio del cambio en proporción frente a los siete días
  anteriores, en puntos porcentuales, con la misma muestra y cortes. Separarlo
  de la proporción conjunta de artículos. Sin referencia comparable, publicar
  presencia sin crecimiento. No usar atribuciones de primer publicador.
- Parámetros iniciales sin validar: hasta ocho destacados; apoyo general de
  cuatro medios y seis artículos, dos artículos para un solo medio; comparador
  de dos a cuatro medios. Para crecimiento: N actual y media previa ≥20,
  aumento en tres medios, ≥90 % analizable y muestra que cubra ≥70 % de medios
  analizables; seguimiento ≥90 % de oportunidades, hueco máximo de 60 minutos
  o dos cadencias. Calibrarlos antes de publicar comparaciones.
- Los ámbitos personales seleccionan fuentes del modo, sin filtrar por sus
  palabras. Conservar candidatos completos, no solo los destacados generales;
  agregar en el dispositivo y aplicar los mínimos después de elegir ámbito.
- Publicar agregados y evidencia en R2 con una revisión común; objetos antes
  que índice, última revisión completa si falla. Medir tamaños y memoria móvil
  antes de habilitarlo. Sin consultas de servidor por selección personal.

## Modos, territorio personal y Telegram

Ubicación en el asistente y entrega por Telegram siguen sin implementar.
El [manual de modos](front/ASISTENTE-MODOS.md#ampliaciones-del-asistente)
conserva las cuestiones de diseño: selección explícita, privacidad, horarios,
cuotas y deduplicación. El motor compartido de fuentes y temas ya existe.

Los sitios del tiempo son locales al dispositivo. Queda por diseñar su
sincronización y si un territorio personal pertenece al perfil o a cada modo.
Las noticias relacionadas con avisos requieren validar ambigüedad y cobertura
antes de ofrecerlas como búsqueda automática.

## Lector y operación

- Pruebas de uso en Firefox y Chrome antes de publicar la extensión; casos en
  su [manual](lector/extension/README.md#chrome-y-comprobaciones-pendientes).
- Mantener las verificaciones de configuración de
  [sincronización](workers/cf-sync/SEGURIDAD.md#verificación-de-la-instalación).
- Revisar y renovar la clave AEMET antes de la caducidad anotada en la revisión
  local (29/01/2027); no se ha comprobado aquí si ya se renovó.
