# Contrato del relacionador territorial

La resolución con estado y evidencia está implementada en Python para Galicia,
Kulturklik y recintos de Madrid, con correspondencias locales versionadas.
La persistencia general de relaciones, vigencias y recorridos descritos abajo
sigue propuesta; no tiene API pública. El modelo de agenda está en su
[manual](../../agenda/README.md).

El relacionador tiene tres responsabilidades: identificar un territorio desde
una referencia externa, conservar vínculos con significado explícito y devolver
los caminos que justifican una selección. El catálogo español actual es la base;
solo añadiremos niveles o fuentes cuando una relación concreta los necesite.

## Identidades y códigos

Se conservan `pais:ES`, `es:autonomia:12`, `es:provincia:36` y
`es:municipio:36038`. Los países añadidos siguen el formato `pais:GB`.
Los identificadores existentes no cambian al incorporar otro sistema o nombre.
Un cambio administrativo que crea otra entidad necesita identidad y vínculos
de sucesión propios; no se reutiliza el ID del municipio anterior.

Para países se utiliza `iso3166-1:alpha2`. [ISO](https://committee.iso.org/iso-3166-country-codes.html)
recomienda alpha-2 para uso general y distingue los códigos de países de los de
subdivisiones. No necesitamos alpha-3, códigos numéricos ni importar ISO 3166-2
para relacionar ahora los municipios españoles. Si llega un código de subdivisión,
su correspondencia con INE se acreditará por separado.

`paises.json` contiene España y los 36 países usados en `medios.py`, contrastados
con las columnas ISO de [Naciones Unidas](https://unstats.un.org/unsd/methodology/m49/overview/).
Es una selección versionada, no el catálogo mundial completo. Los nombres visibles
son etiquetas en castellano; los alias editoriales proceden de nuestro catálogo.
La fecha de comprobación no declara una vigencia histórica del país o del medio.

| Referencia | Destino | Significado |
| --- | --- | --- |
| `iso3166-1:alpha2` / `GB` | `pais:GB` | Código de país. No se transforma `UK` en `GB`. |
| `medios:pais` / `reino-unido` | `pais:GB` | Correspondencia explícita de una categoría propia. |
| `medios:pais` / `eeuu` | `pais:US` | Alias del catálogo; no se deduce del dominio o del idioma. |
| `medios:pais` / `africa` | Pendiente de clasificación como agrupación geográfica | No es un país. Se conserva el literal del catálogo. |
| `ine:municipio` / `36038` | `es:municipio:36038` | Identidad de la instantánea INE ya cargada. |
| `ine:municipio:dc` / `360388` | `es:municipio:36038` | Mismo municipio, tras verificar el control. |
| `kulturklik:municipio_nora` / `476`, provincia `31` | `es:municipio:31201` | Cruce revisado mediante coordenadas municipales y límites oficiales. NORA territorial usa `31/201`; no son códigos intercambiables. |

África puede representarse más adelante como agrupación geográfica —M49 publica
el código regional `002`— si hace falta seleccionarla. Esa agrupación tendría
tipo y relaciones propias; no sería el padre administrativo de los países.
El `null` del resolver actual solo indica que el catálogo no resuelve: no
distingue un código inválido de un país válido que aún no hemos cargado.

## País del medio y cobertura

La relación `pais_catalogo`
indica el país con el que clasificamos el medio o su edición en Voceiro. No
afirma domicilio social, propiedad, nacionalidad ni territorios cubiertos.
`cobertura_editorial` expresa los territorios para los que se ha clasificado
su cobertura; admite varios destinos y precisión municipal/provincial/autonómica.
Los vínculos a noticias concretas siguen pendientes de otro incremento.

La publicación actual de BBC queda así:

```json
{
  "pais": "reino-unido",
  "ambito": "internacional",
  "territorios": [{"territorio": "pais:GB", "papel": "pais_catalogo"}]
}
```

Los medios con país resuelto obtienen ese papel. Africanews conserva `pais: "africa"`
sin enlace de país. No se añade cobertura mundial por tener ámbito internacional,
ni cobertura británica a BBC por su país del catálogo. La región y el ámbito
nacional españoles conservan su proyección de cobertura existente; el contrato
futuro añadirá evidencia y revisión a cada asignación. Un país extranjero o
desconocido no activa el respaldo de cobertura nacional española.

La clasificación actual identifica medios por dominio. Una futura edición con
identidad propia necesitará una referencia contextualizada; el dominio no obliga
a todas las ediciones de una cabecera a compartir país o cobertura.

## Referencia y resultado de resolución

Una referencia conserva `sistema`, `codigo` original como cadena, `contexto`
estructurado y `edicion` cuando la fuente la ofrece. El sistema fija nivel,
formato y contexto obligatorio. La clave compara campos exactos y contexto
normalizado por claves, nunca nombres ni la concatenación informal de números.
Para NORA municipal, la provincia original es obligatoria. La normalización
documentada por el proveedor se registra junto al original.

El contrato de `resolver_referencia(referencia, revision, fecha?)` devuelve:

| Campo | Regla |
| --- | --- |
| `estado` | `resuelto`, `pendiente` o `conflicto`. |
| `territorio` | Un ID solo cuando la identidad está acreditada; `null` en los otros estados. |
| `candidatos` | Posibles destinos con sus pruebas, sin elegir por orden o parecido. |
| `motivo` | Distingue sistema/contexto no soportado, ausencia de correspondencia, vigencia no acreditada y evidencias incompatibles. |
| `referencia` | Entrada conservada, incluido el código original. |
| `revision`, `fecha_referencia` | Identifican el catálogo y la instantánea utilizados. |
| `evidencias` | Referencias comprobables que acreditan el resultado. |

Varias pruebas del mismo destino se reúnen. Dos destinos incompatibles para la
misma referencia y fecha producen conflicto; no gana la última descarga. Si una
referencia representa varias entidades, no se declara equivalencia de identidad:
se conserva pendiente y se modela su asociación múltiple con alcance explícito.

`shared.territorios.relacionador.cargar()` implementa en Python una revisión
local. Sus métodos `resolver_referencia(referencia, fecha=None)` y
`resolver_ubicacion(referencia, fecha=None)` devuelven estos estados y la revisión
cargada; todavía no permiten elegir una revisión histórica. La segunda operación
localiza un recinto, sin declarar que su identidad equivale al municipio.

`correspondencias.json` conserva las tres ubicaciones manuales iniciales de
Madrid y añade 179 referencias de Kulturklik contrastadas con polígonos
oficiales de Euskadi y Navarra. Conserva datos
seleccionados, ruta y huella de la respuesta completa; esta última no se guarda
íntegra. El JSON oficial de centros contiene caracteres de control: para esta
revisión se extrajeron los campos con un lector permisivo, sin modificar la huella
de los bytes descargados. El manifiesto, los lectores locales y los límites
de esta resolución están en [Preparar cruces de agenda](README.md#preparar-cruces-de-agenda).
Los cruces INE directos aportan fila, huella y revisión del catálogo local.

La proyección añade `territorio_resoluciones` a territorios y
`ubicacion_resoluciones` a los recintos de Madrid identificados, junto con
estado, motivo y territorio común. Las pruebas `origen` remiten a las
observaciones/documentos del núcleo. Dos identificadores incompatibles bloquean
la asignación; uno pendiente no activa una preferencia silenciosa por otro.
Las asignaciones de celebración ya usan el municipio de esos recintos, sin
crear nuevos IDs ni relaciones persistidas. Los recorridos públicos con caminos
completos siguen pendientes. Una fecha explícita no se resuelve con la mera
fecha de observación: queda pendiente por vigencia no acreditada.

La versión de `resolver(sistema, codigo)` en Python/JS conserva su resultado de
territorio con ancestros o `None`/`null`. El nuevo contrato de revisión solo se
ejecuta en Python al preparar la lectura; no se ha portado al navegador.

## Registro de relaciones propuesto

Cada vínculo registra ID estable, `tipo`, extremos tipados `{tipo, id}`, estado,
método, alcance, vigencia, evidencias y revisión. Los extremos pueden pertenecer
a catálogos distintos: medios, entidades de agenda, territorios o recursos del
tiempo. No se duplican esas entidades en un grafo independiente.

| Tipo lógico | Origen → destino | Recorrido permitido |
| --- | --- | --- |
| `pertenencia_administrativa` | Territorio → territorio | Ancestros y descendientes acreditados; cadena sin ciclos en cada fecha/revisión. |
| `sucesion_administrativa` | Territorio anterior → sucesor | Solo consulta histórica explícita. Admite fusiones y segregaciones, con alcance total o parcial. |
| `pais_catalogo` | Medio/edición → país | Selección por clasificación; no genera cobertura. Implementado sin el registro completo aún. |
| `cobertura_editorial` | Medio/edición → territorio | Selección por cobertura; no cambia al consultar en sentido inverso. |
| `ubicacion` | Lugar → territorio | Ubicación acreditada; proyección de `ubicado_en` del núcleo. |
| `celebracion` | Evento → lugar/territorio | Recorrer el recinto y sus ancestros; proyección de `se_celebra_en`. |
| `ambito` | Agrupación → territorio | Contexto de la agrupación. No transmite ubicación a sus eventos. |
| `zona_avisos` | Territorio/lugar → zona AEMET | Asociación de servicio con alcance total, parcial o desconocido. No forma jerarquía administrativa. |
| `punto_prevision` | Territorio/lugar → recurso meteorológico | Asociación de servicio; método declarado por fuente o proximidad, con distancia cuando proceda. No prueba ubicación. |

La equivalencia de códigos se registra en las correspondencias hacia una misma
identidad, no como una relación genérica «equivalente a» entre cualquier entidad.
Los nombres de esta tabla son del contrato lógico; no se añaden automáticamente
a `nucleo.RELACIONES`. El núcleo sigue siendo autoridad para sus vínculos y la
proyección conserva los IDs/evidencias de origen. Los nuevos vínculos entre
servicios necesitan almacenamiento revisado antes de publicarse.

Una evidencia identifica fuente, documento o catálogo y su edición/huella cuando
esté disponible, ruta al dato y momento de observación y comprobación. Una URL
sola no sustituye el dato observado. Para `pais_catalogo`, el catálogo local
acredita la clasificación y la fuente internacional acredita el código; no
afirmamos haber revisado las fichas corporativas de todos los medios.

`vigencia: null` significa desconocida. Cuando hay intervalo se usa `[desde,hasta)`;
un extremo abierto solo se declara si la fuente lo permite. La fecha de una
instantánea acredita esa revisión, no toda la historia anterior. Una consulta
histórica sin evidencia temporal queda pendiente. Suspender o corregir un vínculo
conserva su historial; dejar de verlo en una descarga no demuestra su extinción.

## Reglas de consulta propuestas

La operación `relaciones(objetivo, tipo, sentido, revision, fecha?, cursor?)`
exige tipo y sentido (`salientes`/`entrantes`), acota tamaño y pagina. Devuelve
vínculos directos con sus pruebas y estados. Una consulta resuelta solo utiliza
los acreditados; los pendientes/conflictos siguen consultables para revisión.

Los recorridos se definen por servicio, con límite de profundidad y detección
de ciclos. Devuelven camino, revisión y método: no se hace cierre transitivo
de todos los tipos juntos ni se almacena cada resultado como un hecho nuevo.

| Consulta | Camino y respuesta |
| --- | --- |
| Eventos celebrados en Galicia | Evento → territorio o recinto → municipio → provincia → autonomía. No se atraviesa una competición ni el país de un medio. |
| Medios por país del catálogo | Solo `pais_catalogo`. BBC puede aparecer bajo `GB` sin que sus noticias se localicen allí. |
| Medios con cobertura directa de un municipio | Coincidencia de destino en `cobertura_editorial`; devuelve la asignación original. |
| Consulta provincial con cobertura contenida | Admite medios municipales de esa provincia y los identifica como municipales; no les atribuye cobertura provincial completa. |
| Consulta municipal ampliada a cobertura superior | Solo si se solicita; distingue medios provinciales, autonómicos y nacionales. No incluye un medio de otro municipio por compartir provincia. |
| Contexto meteorológico de un recinto | Ubicación acreditada y asociación de servicio, o aproximación por coordenadas explícita. Una zona parcial no acredita afectación exacta al recinto. |

Los modos `directa`, `contenida` y `superior` son selecciones distintas. Ninguna
queda implícita en el hecho de consultar el vínculo en sentido inverso. Una
cobertura específica revisada tiene prioridad sobre el respaldo regional; un
conflicto no reactiva silenciosamente la cobertura amplia.

Un evento puede tener varias ubicaciones declaradas sin que eso sea un conflicto.
Hay conflicto cuando las pruebas incompatibles pretenden resolver una misma
identidad o ubicación única. La selección deduplica entidades por su ID y devuelve
los caminos que coinciden; no multiplica un evento por cada código equivalente.

## Pendiente

- Completar las referencias Kulturklik sin coordenadas, fuera de cobertura o
  con datos contradictorios. Los recintos con coordenadas ya se ubican con los
  [límites municipales](README.md#límites-municipales) del IGN.
  Los nombres no bastan para resolverlos. El cruce de 179 referencias ya se
  aplica a datos guardados; Iparralde necesita un catálogo francés.
- Persistir los registros tipados, con ciclos, evidencias y vigencias; implementar
  consultas inversas y recorridos por servicio antes de ofrecer una API común.
- Incorporar cobertura editorial múltiple y asociaciones meteorológicas con
  alcance explícito. Las excepciones actuales de AEMET están documentadas en
  su [revisión](revision-aemet-2026-10-25.md), sin registro general aún.
- Revisar otros niveles solo cuando una integración los necesite: NORA,
  distritos/barrios de Madrid, comarcas, parroquias y núcleos no se resuelven
  como códigos municipales ni se añaden por deducción de nombres o prefijos.

La aceptación exige preservar IDs, controles INE y ceros iniciales; igualdad
Python/JS para el contrato compartido; pendientes y conflictos visibles; y
recorridos que separen ubicación, ámbito, cobertura y previsión. La suite
completa se ejecuta en CI.
