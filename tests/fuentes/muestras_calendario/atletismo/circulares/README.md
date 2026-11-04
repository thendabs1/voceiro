# Capturas de índices y lecturas revisadas

Capturas oficiales reales. `manifest.json` da URL, procedencia y SHA-256 de cada
respuesta íntegra incluida. Las mutaciones en los tests son casos de fallo y no
sustituyen estas capturas.

- RFEA 0/1: contador acumulado; «113/20026» se conserva. Página 209: circular
  107-2022 sin archivo, distinta de una columna desaparecida.
- FGA 0: anexos y continuación publicada. Página 43: circular sin enlace. Páginas
  79/80: último lote y respuesta terminal explícita, sin `paperList`.
- FCA: índice HTML y reglaments de la auditoría normativa; REST público actual
  con 100 filas y última página de 80, total 380. El HTML anterior conservado
  anunciaba 379: no se reescribe para hacerlo pasar por la captura actual.
- PDF completos de normas 21/22 de Castro y los dos controles de Cornellà,
  con sus hashes originales. Los tests verifican los literales usando Poppler.
- Extractos FGA 180, FGA 168, Vigo y RFEA 160: únicamente los pasajes usados por
  la revisión, sin listas de atletas. Sus catálogos guardan el hash del PDF
  íntegro descargado; el extracto no suplanta esos bytes en la prueba SHA.
