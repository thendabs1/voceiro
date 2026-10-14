// ==UserScript==
// @name         Lector Universal
// @namespace    https://thendabs1.github.io/voceiro/
// @version      {{VERSION}}
// @description  Modo lectura accesible para medios: perfil de lectura, pendientes, diccionarios, lectura rápida, extracción asistida y atajos. Complemento de Voceiro.
// @author       Voceiro
// @license      MIT
// @homepageURL  https://github.com/thendabs1/voceiro/tree/main/lector
// @updateURL    https://thendabs1.github.io/voceiro/lector.user.js
// @downloadURL  https://thendabs1.github.io/voceiro/lector.user.js
// @match        *://*/*
// @exclude      *://localhost/*
// @exclude      *://127.0.0.1/*
// @exclude      *://0.0.0.0/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        window.close
// @grant        window.focus
// @require      https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function(){
'use strict';

