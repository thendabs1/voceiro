// Código (CSS y JS) que algunos CMS dejan dentro del articleBody del
// JSON-LD: se quita sin tocar la prosa de alrededor. Los textos imitan el
// patrón de Onm (Nós Diario), con un gráfico interactivo en medio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarCodigoIncrustado } from '../../lector/modulos/codigo-incrustado.js';

const ANTES = 'El paro bajó un 2,1% en septiembre (EPA), según el INE; es el mejor dato desde 2008.';
const DESPUES = 'En términos mensuales, los precios subieron un 0,2%. La vivienda encabeza las subidas del año.';
const CSS = '.graf{--azul:#1d4ed8;font-family:"Segoe UI",sans-serif} .graf .titulo{margin:0 0 4px;font-size:20px}' +
  ' @media (max-width:420px){.graf{padding:12px}} #graf-paro .fila{display:grid;gap:8px}';
const JS = "(function(){ var raiz=document.getElementById('graf-paro'); if(!raiz)return;" +
  " function f(v){return v.toFixed(1).replace('.',',')+'%';}" +
  " raiz.innerHTML='El paro por comunidades en septiembre' +'Pasa el ratón por una barra para ver el detalle de cada comunidad autónoma. Fuente: INE.';" +
  " var datos=[['Galicia',5.5],['Comunidad de Madrid',5.3]]; datos.forEach(function(d){ raiz.innerHTML+=d[0]+f(d[1]); }); })();";
const GRAFICO = CSS + ' Cargando gráfico… ' + JS;

test('quita el CSS, el aviso de carga y el JS de un gráfico', () => {
  assert.equal(limpiarCodigoIncrustado(ANTES + ' ' + GRAFICO + ' ' + DESPUES), ANTES + ' ' + DESPUES);
});

test('quita dos gráficos y deja la prosa que hay entre ellos', () => {
  const medio = 'La inflación subyacente se mantiene en el 3,1%, su nivel más alto desde marzo.';
  assert.equal(
    limpiarCodigoIncrustado(ANTES + ' ' + GRAFICO + ' ' + medio + ' ' + GRAFICO + ' ' + DESPUES),
    ANTES + ' ' + medio + ' ' + DESPUES);
});

test('quita el código que va al final del texto', () => {
  assert.equal(limpiarCodigoIncrustado(ANTES + ' ' + GRAFICO), ANTES);
});

test('el texto sin código no cambia, ni siquiera los saltos de línea', () => {
  const texto = 'El IPC (índice de precios) sube al 4,9%; o mesmo que no Estado.\n\n' +
    "L'any passat va ser d'un 2,9%, segons l'INE. «Es una cifra alta», dijo la ministra.\n\n" +
    'Los datos (provisionales) se revisarán en noviembre: 3,1% frente a 2,8%.';
  assert.equal(limpiarCodigoIncrustado(texto), texto);
});

test('una comilla sin cerrar no se come el resto del artículo', () => {
  const roto = "(function(){ var s='sin cerrar; x=1; })();";
  assert.equal(limpiarCodigoIncrustado(ANTES + ' ' + roto + ' ' + DESPUES), ANTES + ' ' + DESPUES);
});

test('aguanta textos vacíos o que no son texto', () => {
  assert.equal(limpiarCodigoIncrustado(''), '');
  assert.equal(limpiarCodigoIncrustado(null), '');
  assert.equal(limpiarCodigoIncrustado(undefined), '');
});
