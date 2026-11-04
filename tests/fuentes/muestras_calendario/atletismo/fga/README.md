Capturas FGA para F01–F14 y D-* del estudio de 3/11/2026. `capturas.json`
identifica URL, archivo, ruta original en el estudio y SHA-256 **del original**.
Los HTML conservan artículos, fechas, etiquetas, enlaces y bloques usados;
se retiran navegación, SVG, imágenes y contactos. Los tests no usan red.

- F01: `listado-112655.html`, artículo 112655 de
  `fga/muestras/0061-0e5d5e30a12e.html` (mes de febrero).
- F03: `listado-119957.html`, artículo 119957 de
  `fga/muestras/0059-fb3d122c188e.html` (enero), más la ficha real del plan.
- Sin ámbito: `sin-ambito-100123.html`, artículo y canonical de
  `fga/muestras/0091-c747fcb1f0a8.html`. El test sintetiza la consulta por ID;
  no prueba que esa ruta se haya consultado en red.
- Los `.pdf.txt` son extractos literales de los documentos capturados,
  recortados a las declaraciones relevantes, sin marcas ni participantes.
  El catálogo de lecturas documentales incluye la huella binaria original;
  usa estas lecturas revisadas solo cuando la ficha enlaza ese documento.
- F14 conserva la ficha y su enlace al PDF escaneado. No se copia el binario:
  no hay extractor de escaneados en este adaptador. Se exige pendiente de
  revisión visual y actividad desconocida, sin afirmar un documento vacío.
- Noviembre y diciembre: API y HTML completos de los filtros declarados.
  Las fichas disponibles se completan con siete capturas FGA del estudio
  `cruce/`. Faltan 44 fichas/padres de las 70 URLs enlazadas: la simulación
  declara esa cobertura parcial y conserva las observaciones previas.
- Las envolturas sintéticas de F09 y de resolución por ID están señaladas en
  los tests. Sus fichas proceden de las capturas, sin sustituir una captura
  ausente por datos fabricados.

Reproducción de métricas, desde la raíz y sin escribir la instantánea:

```
/home/debs4/voceiro/venv/bin/python tests/fuentes/simular_atletismo_fga.py RUTA_AL_NUCLEO
```

F15/F16, Excel, OCR e identidad entre fuentes quedan fuera de esta suite FGA.
