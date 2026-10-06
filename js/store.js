/* Capa de datos.
 * Fase 1: guarda en el navegador (localStorage).
 * Fase 2: se reemplaza por SupabaseStore con la MISMA interfaz asíncrona, sin tocar app.js:
 *   getCatalogo / saveCatalogo / listarProyectos / getProyecto / saveProyecto / eliminarProyecto
 * Ver README.md → «Fase 2 — Supabase» para el modelo de tablas propuesto. */
(function (global) {
  'use strict';

  var K = {
    catalogo: 'cmc.catalogo',
    indice: 'cmc.proyectos',
    proyecto: function (id) { return 'cmc.proyecto.' + id; },
    actual: 'cmc.proyectoActual'
  };

  function leer(k, def) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function escribir(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.error('No se pudo guardar', k, e); return false; }
  }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  function uid(prefijo) {
    return (prefijo || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var LocalStore = {
    nombre: 'Navegador (local)',

    getCatalogo: function () {
      var c = leer(K.catalogo, null);
      return Promise.resolve(c || clonar(global.CATALOGO_BASE));
    },
    saveCatalogo: function (cat) {
      cat.actualizado = new Date().toISOString().slice(0, 10);
      return Promise.resolve(escribir(K.catalogo, cat));
    },
    restablecerCatalogo: function () {
      localStorage.removeItem(K.catalogo);
      return Promise.resolve(clonar(global.CATALOGO_BASE));
    },

    listarProyectos: function () {
      return Promise.resolve(leer(K.indice, []));
    },
    getProyecto: function (id) {
      return Promise.resolve(leer(K.proyecto(id), null));
    },
    saveProyecto: function (p) {
      p.actualizado = new Date().toISOString();
      escribir(K.proyecto(p.id), p);
      var idx = leer(K.indice, []).filter(function (x) { return x.id !== p.id; });
      idx.unshift({ id: p.id, numero: p.numero, nombre: p.nombre, actualizado: p.actualizado });
      return Promise.resolve(escribir(K.indice, idx));
    },
    eliminarProyecto: function (id) {
      localStorage.removeItem(K.proyecto(id));
      escribir(K.indice, leer(K.indice, []).filter(function (x) { return x.id !== id; }));
      return Promise.resolve(true);
    },

    getProyectoActual: function () { return leer(K.actual, null); },
    setProyectoActual: function (id) { escribir(K.actual, id); }
  };

  global.Store = LocalStore;
  global.uid = uid;
})(window);
