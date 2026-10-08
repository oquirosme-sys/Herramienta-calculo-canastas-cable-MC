/* Canastas MC — interfaz.
 * Pestañas: Proyecto (datos, parámetros y niveles) · una pestaña por nivel (tramos + cables) ·
 * Memoria de cálculo (resumen, materiales y detalle) · Ayuda · Administración (solo administrador). */
(function () {
  'use strict';

  var S = {
    catalogo: null,
    proyecto: null,
    indice: [],
    vista: 'proyecto',
    filtroTramo: {},
    adminSub: 'canastas',
    adminFiltro: { serie: '', texto: '', fab: '', clase: '' }
  };
  var R = null; // resultados del cálculo (se recalculan en cada render)

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var vista = $('#vista');

  /* ================= Utilidades ================= */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function parseNum(v) {
    if (v === null || v === undefined) return '';
    var t = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (t === '') return '';
    var n = Number(t);
    return isFinite(n) ? n : '';
  }
  function fmt(n, d) {
    if (n === null || n === undefined || n === '' || !isFinite(n)) return '';
    return Number(n).toLocaleString('es-CR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtPct(n) { return n === null || n === undefined ? '' : fmt(n * 100, 1) + ' %'; }
  function opt(value, label, selected, extra) {
    return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + (extra || '') + '>' + esc(label) + '</option>';
  }
  function estadoDe(texto) {
    var c = (texto || '').charAt(0);
    return c === '❌' ? 'error' : c === '⚠' ? 'warn' : c === '✔' ? 'ok' : texto ? 'pend' : '';
  }
  function chip(texto, estado) {
    if (!texto) return '';
    return '<span class="chip ' + (estado || estadoDe(texto)) + '">' + esc(texto) + '</span>';
  }
  function pctCell(v, warnLim, errLim) {
    if (v === null || v === undefined) return '';
    var cls = errLim !== null && v > errLim ? 'error' : (warnLim !== null && v > warnLim ? 'warn' : '');
    var w = Math.max(0, Math.min(100, v * 100));
    return '<div class="pct ' + cls + '"><span>' + fmtPct(v) + '</span><div class="bar"><i style="width:' + w + '%"></i></div></div>';
  }
  /* Ocupación bruta: referencia del fabricante (naranja si supera su factor de llenado) */
  function pctBruta(v, estado) {
    if (v === null || v === undefined) return '';
    var w = Math.max(0, Math.min(100, v * 100));
    return '<div class="pct ' + (estado || '') + '"><span>' + fmtPct(v) + '</span><div class="bar"><i style="width:' + w + '%"></i></div></div>';
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function descargar(nombre, contenido, tipo) {
    var blob = new Blob([contenido], { type: tipo || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csv(filas) {
    return '﻿' + filas.map(function (f) {
      return f.map(function (c) {
        var s = c === null || c === undefined ? '' : String(c);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');
  }
  function slug(s) { return String(s || 'proyecto').normalize('NFD').replace(/[^\w]+/g, '_').replace(/^_|_$/g, ''); }

  /* Diálogo genérico: devuelve Promise<null | {valores}> */
  function dialogo(opts) {
    var dlg = $('#dlg');
    $('#dlgTitulo').textContent = opts.titulo || '';
    $('#dlgCuerpo').innerHTML = opts.html || '';
    var ok = $('#dlgOk');
    ok.textContent = opts.ok || 'Aceptar';
    ok.className = 'btn ' + (opts.peligro ? 'btn-danger' : 'btn-primary');
    $('#dlgCancelar').hidden = !!opts.soloOk;
    return new Promise(function (resolve) {
      dlg.returnValue = '';
      dlg.onclose = function () {
        if (dlg.returnValue !== 'ok') return resolve(null);
        var vals = {};
        dlg.querySelectorAll('#dlgCuerpo [name]').forEach(function (el) { vals[el.name] = el.value; });
        resolve(vals);
      };
      dlg.showModal();
      var primero = dlg.querySelector('#dlgCuerpo input, #dlgCuerpo select');
      if (primero) primero.focus();
    });
  }
  function confirmar(titulo, texto, peligro) {
    return dialogo({ titulo: titulo, html: '<p>' + texto + '</p>', ok: peligro ? 'Eliminar' : 'Aceptar', peligro: peligro })
      .then(function (v) { return !!v; });
  }

  /* ================= Modelo ================= */
  var VACIA = { id: '', marca: '', sistema: 'canasta', nombre: '', claros: [], acabados: [] };
  function serieDe(id) { return S.catalogo.series.filter(function (s) { return s.id === id; })[0] || null; }
  /* Línea de producto por defecto del proyecto (canasta / escalera / ducto de una marca) */
  function serieActual() { return serieDe(S.proyecto.parametros.serie) || S.catalogo.series[0] || VACIA; }
  function marcaDe(id) { return S.catalogo.marcas.filter(function (m) { return m.id === id; })[0] || { nombre: '' }; }
  function nombreSerie(s) { return s ? (marcaDe(s.marca).nombre + ' · ' + (Calc.SISTEMAS[s.sistema] || s.sistema) + (s.nombre ? ' — ' + s.nombre : '')) : ''; }
  /* Opciones de línea de producto agrupadas por marca */
  function opcionesSeries(sel, extra) {
    var grupos = {};
    S.catalogo.series.forEach(function (s) { (grupos[s.marca] = grupos[s.marca] || []).push(s); });
    return (extra || '') + S.catalogo.marcas.filter(function (m) { return grupos[m.id]; }).map(function (m) {
      return '<optgroup label="' + esc(m.nombre) + '">' + grupos[m.id].map(function (s) {
        return opt(s.id, (Calc.SISTEMAS[s.sistema] || s.sistema) + (s.nombre ? ' — ' + s.nombre : ''), s.id === sel);
      }).join('') + '</optgroup>';
    }).join('');
  }
  function nuevoProyecto(datos) {
    var cat = S.catalogo;
    var serie = cat.series[0] || VACIA;
    return Object.assign({
      id: uid('p'), numero: '', nombre: '', ubicacion: '', fecha: '', elaboro: '',
      parametros: {
        reserva: 0.7, claro: serie.claros[0] || '', tipo: (cat.tiposCanasta[0] || {}).id || '', altoMax: 150,
        sdVentilada: 30, sdSolido: 25, serie: serie.id, acabado: serie.acabados[0] || '',
        fabricanteCable: (cat.fabricantesCable[0] || {}).id || '',
        ductoFactor: 0.20, ductoMaxConductores: 30
      },
      niveles: []
    }, datos || {});
  }
  /* Proyectos guardados antes de las líneas de producto y de los parámetros del ducto cuadrado */
  function migrarProyecto(p) {
    var par = p.parametros || (p.parametros = {});
    if (!par.serie) {
      var s = S.catalogo.series.filter(function (x) { return x.marca === par.marca && x.sistema === 'canasta'; })[0] || S.catalogo.series[0] || VACIA;
      par.serie = s.id;
    }
    var def = { ductoFactor: 0.20, ductoMaxConductores: 30 };
    Object.keys(def).forEach(function (k) { if (par[k] === undefined || par[k] === '') par[k] = def[k]; });
    if (par.fabricanteCable === undefined) par.fabricanteCable = marcaCablePorUso(p);
    return p;
  }
  function nuevoNivel(nombre) {
    return { id: uid('n'), nombre: nombre, tramos: [nuevoTramo(), nuevoTramo(), nuevoTramo()], cables: [] };
  }
  function nuevoTramo() { return { id: uid('t'), nombre: '', serie: '', tipo: '', claro: '', canasta: '', distancia: '' }; }
  function nuevaLinea(tramoId) { return { id: uid('l'), tramo: tramoId || '', cable: '', cant: '' }; }
  function nivelPorId(id) { return S.proyecto.niveles.filter(function (n) { return n.id === id; })[0]; }

  /* ---- Cables: un solo desplegable con la descripción del catálogo, de la marca de cable del proyecto ---- */
  var NOMBRE_MATERIAL = { Cu: 'Cobre', Al: 'Aluminio' };
  function cablePorId(id) { return S.catalogo.cables.filter(function (c) { return c.id === id; })[0] || null; }
  function cablesDeMarca() {
    var fab = S.proyecto.parametros.fabricanteCable;
    return S.catalogo.cables.filter(function (c) { return !fab || c.fabricante === fab; });
  }
  /* Cable equivalente en la marca del proyecto: mismo material, # de conductores y calibre; con varias opciones
   * se prefiere la misma cantidad de hilos y, si no hay, la de más hilos. */
  function cableEquivalente(c) {
    var a = Calc.atributosCable(c);
    var lista = cablesDeMarca().filter(function (x) {
      var b = Calc.atributosCable(x);
      return b.material === a.material && b.conductores === a.conductores && b.calibre === a.calibre;
    });
    if (!lista.length) return null;
    var igual = lista.filter(function (x) { return Calc.atributosCable(x).hilos === a.hilos; });
    if (igual.length) return igual[0];
    lista.sort(function (x, y) { return parseInt(Calc.atributosCable(y).hilos || '0', 10) - parseInt(Calc.atributosCable(x).hilos || '0', 10); });
    return lista[0];
  }
  /* Al cambiar la marca de cable del proyecto: cada línea pasa al cable equivalente de la nueva marca;
   * si no existe equivalente se conserva el cable (marcado «otra marca») para que lo revise. */
  function remapearMarcaCable() {
    var fab = S.proyecto.parametros.fabricanteCable, cambiadas = 0, sinEquivalente = 0;
    S.proyecto.niveles.forEach(function (nv) {
      nv.cables.forEach(function (l) {
        var c = l.cable ? cablePorId(l.cable) : null;
        if (!c || c.fabricante === fab) return;
        var eq = cableEquivalente(c);
        if (eq) { l.cable = eq.id; cambiadas++; } else sinEquivalente++;
      });
    });
    if (cambiadas || sinEquivalente) toast(cambiadas + ' línea(s) cambiadas a la nueva marca' + (sinEquivalente ? ' · ' + sinEquivalente + ' sin equivalente: revíselas' : ''));
  }
  function marcaCablePorUso(p) {
    var cuenta = {};
    p.niveles.forEach(function (nv) { nv.cables.forEach(function (l) { var c = cablePorId(l.cable); if (c) cuenta[c.fabricante] = (cuenta[c.fabricante] || 0) + 1; }); });
    var mejor = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; })[0];
    return mejor || (S.catalogo.fabricantesCable[0] || {}).id || '';
  }

  /* Proyecto de ejemplo = datos de la pestaña N01 del Excel */
  function proyectoEjemplo() {
    var cat = S.catalogo;
    var porNombre = function (lista, nombre) { return (lista.filter(function (x) { return x.nombre === nombre; })[0] || {}).id || ''; };
    var p = nuevoProyecto({ numero: '922c', nombre: 'Ejemplo — oficina Sinergia', ubicacion: 'Escazú', fecha: new Date().toISOString().slice(0, 10) });
    var n = nuevoNivel('Nivel 1');
    p.niveles = [n];
    var t1 = { id: uid('t'), nombre: 'Ejemplo 1 — bandeja principal', tipo: 'ventilada', claro: 4.9, canasta: porNombre(cat.canastas, '4x18 (CF 105/450)'), distancia: 50 };
    var t2 = { id: uid('t'), nombre: 'Ejemplo 2 — mezcla con cables ≥ 4/0', tipo: 'ventilada', claro: 7.38, canasta: porNombre(cat.canastas, '4x18 (CF 105/450)'), distancia: 30 };
    n.tramos = [t1, t2, nuevoTramo()];
    n.cables = [
      { id: uid('l'), tramo: t1.id, cable: porNombre(cat.cables, 'MC Cu THHN 3C 12AWG 19h (SLDM03) Viakon'), cant: 50 },
      { id: uid('l'), tramo: t1.id, cable: porNombre(cat.cables, 'MC Cu THHN 3C 10AWG 19h (SLDM71) Viakon'), cant: 15 },
      { id: uid('l'), tramo: t2.id, cable: porNombre(cat.cables, 'MC Cu ARMANEL 3C 600kcmil (14011401LA) Condumex'), cant: 2 },
      { id: uid('l'), tramo: t2.id, cable: porNombre(cat.cables, 'MC Cu THHN 3C 12AWG 19h (SLDM03) Viakon'), cant: 40 }
    ];
    return p;
  }

  /* ================= Guardado ================= */
  var tGuardar = null, tGuardarCat = null;
  function marcarSucio() {
    var e = $('#estadoGuardado');
    e.textContent = '●  Guardando…';
    e.classList.add('dirty');
  }
  function guardar() {
    marcarSucio();
    clearTimeout(tGuardar);
    tGuardar = setTimeout(function () {
      Store.saveProyecto(S.proyecto).then(function () {
        return Store.listarProyectos();
      }).then(function (idx) {
        S.indice = idx;
        renderSelector();
        var e = $('#estadoGuardado');
        e.textContent = '●  Guardado';
        e.classList.remove('dirty');
      });
    }, 400);
  }
  function guardarCatalogo() {
    marcarSucio();
    clearTimeout(tGuardarCat);
    tGuardarCat = setTimeout(function () {
      Store.saveCatalogo(S.catalogo).then(function () {
        var e = $('#estadoGuardado');
        e.textContent = '●  Catálogo guardado';
        e.classList.remove('dirty');
      });
    }, 400);
  }

  /* ================= Render principal ================= */
  function claveFoco(el) {
    if (!el || !el.getAttribute) return null;
    var attrs = ['data-bind', 'data-nv', 'data-t', 'data-l', 'data-a', 'data-filtro'];
    for (var i = 0; i < attrs.length; i++) {
      var v = el.getAttribute(attrs[i]);
      if (v) return '[' + attrs[i] + '="' + v.replace(/"/g, '\\"') + '"]';
    }
    return null;
  }

  function render() {
    var foco = claveFoco(document.activeElement);
    var scrolls = Array.prototype.map.call(vista.querySelectorAll('.tbl-wrap'), function (w) { return w.scrollLeft; });
    R = Calc.calcularProyecto(S.proyecto, S.catalogo);
    renderTabs();
    var v = S.vista;
    if (v === 'proyecto') vista.innerHTML = vistaProyecto();
    else if (v.indexOf('nivel:') === 0) {
      var nv = nivelPorId(v.slice(6));
      if (!nv) { S.vista = 'proyecto'; return render(); }
      vista.innerHTML = vistaNivel(nv);
    }
    else if (v === 'memoria') vista.innerHTML = vistaMemoria();
    else if (v === 'ayuda') vista.innerHTML = vistaAyuda();
    else if (v === 'admin') vista.innerHTML = Auth.esAdmin() ? vistaAdmin() : vistaProyecto();
    vista.querySelectorAll('.tbl-wrap').forEach(function (w, i) { if (scrolls[i]) w.scrollLeft = scrolls[i]; });
    if (foco) {
      var el = vista.querySelector(foco);
      if (el) { el.focus(); if (el.select && el.tagName === 'INPUT' && el.type !== 'checkbox') el.select(); }
    }
  }
  function renderPronto() { setTimeout(render, 0); }

  function renderSelector() {
    var sel = $('#selProyecto');
    sel.innerHTML = S.indice.map(function (p) {
      return opt(p.id, (p.numero ? p.numero + ' · ' : '') + (p.nombre || '(sin nombre)'), p.id === S.proyecto.id);
    }).join('');
  }

  function renderTabs() {
    var h = [];
    var tab = function (id, label, extra, cls) {
      h.push('<button class="seccion ' + (cls || '') + (S.vista === id ? ' activa' : '') + '" data-vista="' + esc(id) + '" role="tab">' + (extra || '') + esc(label) + '</button>');
    };
    tab('proyecto', 'Proyecto');
    h.push('<span class="seccion-sep"></span>');
    R.niveles.forEach(function (nv) {
      var r = nv.resumen;
      var dot = r.errores ? 'error' : r.advertencias ? 'warn' : r.tramos ? 'ok' : '';
      tab('nivel:' + nv.nivel.id, nv.nivel.nombre || '(sin nombre)', dot ? '<span class="dot ' + dot + '"></span>' : '');
    });
    h.push('<button class="seccion seccion-agregar" data-act="nivel-agregar-rapido" title="Agregar nivel">＋ Nivel</button>');
    h.push('<span class="seccion-sep"></span>');
    tab('memoria', 'Memoria de cálculo');
    tab('ayuda', 'Ayuda');
    if (Auth.esAdmin()) tab('admin', 'Administración', '', 'seccion-admin');
    $('#tabs').innerHTML = h.join('');
    var adm = Auth.esAdmin();
    $('#btnAdmin').classList.toggle('on', adm);
    $('#lblAdmin').textContent = adm ? 'Admin activo' : 'Administrador';
    $('.lock').textContent = adm ? '🔓' : '🔒';
  }

  /* ================= Vista: Proyecto ================= */
  function vistaProyecto() {
    var p = S.proyecto, par = p.parametros, cat = S.catalogo, serie = serieActual();
    var campo = function (label, html, hint) {
      return '<div class="field"><label>' + label + '</label>' + html + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
    };
    var txt = function (bind, val, ph, type) {
      return '<input data-bind="' + bind + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"' + (type ? ' type="' + type + '"' : '') + '>';
    };
    var reservaTxt = par.reserva >= 1
      ? '100 % — sin reserva: se usa el límite completo de NEC 392.22(A).'
      : 'Se acepta hasta ' + fmt(par.reserva * 100, 0) + ' % del área permitida por NEC (reserva de ' + fmt((1 - par.reserva) * 100, 0) + ' % para crecimiento futuro).';

    var h = [];
    h.push('<div class="page-h"><div><h1>Proyecto</h1><div class="meta">Datos generales, parámetros de cálculo y niveles del edificio. Las celdas verdes son de entrada.</div></div></div>');

    h.push('<div class="card"><div class="card-h"><h2>Datos del proyecto</h2></div><div class="card-b"><div class="grid-form">');
    h.push(campo('Proyecto # / Project #', txt('numero', p.numero, 'ej. 922c')));
    h.push(campo('Nombre / Name', txt('nombre', p.nombre, 'Nombre del proyecto')));
    h.push(campo('Ubicación / Location', txt('ubicacion', p.ubicacion, 'Ciudad / provincia')));
    h.push(campo('Fecha / Date', txt('fecha', p.fecha, '', 'date')));
    h.push(campo('Elaboró / Prepared by', txt('elaboro', p.elaboro, 'Nombre del responsable')));
    h.push('</div></div></div>');

    h.push('<div class="card"><div class="card-h"><h2>Parámetros de cálculo</h2><span class="sub">Aplican a todo el edificio; cada tramo puede cambiar tipo y claro.</span></div><div class="card-b"><div class="grid-form">');
    h.push(campo('Reserva de diseño (% máx. del área NEC)',
      '<select data-bind="par.reserva" data-type="num">' + cat.reservas.map(function (r) { return opt(r, fmt(r * 100, 0) + ' %', Number(par.reserva) === r); }).join('') + '</select>', reservaTxt));
    h.push(campo('Canalización por defecto (marca · tipo)',
      '<select data-bind="par.serie">' + opcionesSeries(par.serie) + '</select>', esc(serie.nota || 'Cada tramo puede usar otra canalización (canasta, escalera o ducto cuadrado).')));
    h.push(campo('Acabado / Finish',
      '<select data-bind="par.acabado">' + (serie.acabados || []).map(function (a) { return opt(a, a, a === par.acabado); }).join('') + '</select>', 'Se agrega a la referencia del fabricante (ej. CF54/200EZ).'));
    h.push(campo('Marca de cable / Cable brand',
      '<select data-bind="par.fabricanteCable">' + cat.fabricantesCable.map(function (f) { return opt(f.id, f.nombre, f.id === par.fabricanteCable); }).join('') + '</select>',
      'Una sola marca para todo el proyecto. En cada nivel solo se ofrecen los cables de esta marca.'));
    h.push(campo('Tipo de canasta por defecto',
      '<select data-bind="par.tipo">' + cat.tiposCanasta.map(function (t) { return opt(t.id, t.nombre, t.id === par.tipo); }).join('') + '</select>', 'Escalera / ventilada usa Col. 1-2 y 30·Sd; fondo sólido usa Col. 3-4 y 25·Sd. No aplica al ducto cuadrado.'));
    h.push(campo('Claro entre soportes por defecto (ft)',
      '<select data-bind="par.claro" data-type="num">' + (serie.claros || []).map(function (c) { return opt(c, fmt(c, 2) + ' ft (' + fmt(c * 0.3048, 2) + ' m)', Number(par.claro) === Number(c)); }).join('') + '</select>',
      'Claros de la tabla de carga de la línea por defecto. En otras líneas se usa su primer claro si este no existe.'));
    h.push(campo('Altura máxima de cómputo (mm)', '<input data-bind="par.altoMax" data-type="num" value="' + esc(par.altoMax) + '">', 'NEC 392.22(A): máx. 150 mm (6 in). Solo afecta la ocupación bruta (referencia).'));
    h.push(campo('Factor Sd — escalera / ventilada', '<input data-bind="par.sdVentilada" data-type="num" value="' + esc(par.sdVentilada) + '">', 'Col. 2 base − 30·Sd (Sd = Σ diámetros ≥ 4/0, mm).'));
    h.push(campo('Factor Sd — fondo sólido', '<input data-bind="par.sdSolido" data-type="num" value="' + esc(par.sdSolido) + '">', 'Col. 4 base − 25·Sd.'));
    h.push(campo('Ducto cuadrado — llenado NEC 376.22 (%)', '<input data-bind="par.ductoFactor" data-type="pct" value="' + esc(fmt(par.ductoFactor * 100, 0)) + '">', 'NEC 376.22(A): la suma de áreas de los conductores ≤ 20 % de la sección interior del ducto.'));
    h.push(campo('Ducto cuadrado — máx. conductores portadores', '<input data-bind="par.ductoMaxConductores" data-type="num" value="' + esc(par.ductoMaxConductores) + '">', 'NEC 376.22(B): con más de 30 conductores portadores de corriente se aplican los factores de ajuste de 310.15(C)(1).'));
    h.push('</div></div></div>');

    // Niveles
    h.push('<div class="card"><div class="card-h"><h2>Niveles del edificio</h2><span class="sub">Cada nivel crea su propia pestaña para llenar los tramos y cables.</span></div><div class="card-b">');
    if (!R.niveles.length) h.push('<div class="empty">Aún no hay niveles. Escriba el nombre del primer nivel abajo (ej. N01, S1, AZOTEA) o genérelos en serie.</div>');
    h.push('<div class="niveles-list">');
    R.niveles.forEach(function (nv, i) {
      var r = nv.resumen, n = nv.nivel;
      var est = r.errores ? chip(r.errores + ' error(es)', 'error') : r.advertencias ? chip(r.advertencias + ' advertencia(s)', 'warn') : r.tramos ? chip('OK', 'ok') : chip('sin cables', 'pend');
      h.push('<div class="nivel-row"><span class="num-badge">' + (i + 1) + '</span>' +
        '<input class="in" data-nv="' + n.id + '|nombre" value="' + esc(n.nombre) + '" placeholder="Nombre del nivel (ej. N02, S1, AZOTEA)">' +
        '<span class="info">' + n.tramos.length + ' tramos · ' + r.cables + ' cables · ' + fmt(r.longitud, 1) + ' m ' + est + '</span>' +
        '<span class="acts">' +
        '<button class="btn-icon" data-act="nivel-subir" data-id="' + n.id + '" title="Subir"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button class="btn-icon" data-act="nivel-bajar" data-id="' + n.id + '" title="Bajar"' + (i === R.niveles.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '<button class="btn-icon" data-act="nivel-duplicar" data-id="' + n.id + '" title="Duplicar nivel">⧉</button>' +
        '<button class="btn btn-sm" data-vista="nivel:' + n.id + '">Abrir</button>' +
        '<button class="btn-icon del" tabindex="-1" data-act="nivel-eliminar" data-id="' + n.id + '" title="Eliminar nivel">✕</button>' +
        '</span></div>');
    });
    h.push('</div>');
    h.push('<div class="add-row"><input class="in" id="nuevoNivelNombre" placeholder="Nombre del nuevo nivel">' +
      '<button class="btn btn-primary" data-act="nivel-agregar">＋ Agregar nivel</button>' +
      '<span class="sub" style="color:var(--ink-3)">o generar en serie:</span>' +
      '<input class="in" id="serPrefijo" value="Nivel " style="width:90px">' +
      '<input class="in" id="serDesde" value="' + (S.proyecto.niveles.length + 1) + '" style="width:60px" title="Desde">' +
      '<input class="in" id="serHasta" value="' + (S.proyecto.niveles.length + 3) + '" style="width:60px" title="Hasta">' +
      '<button class="btn" data-act="nivel-serie">Generar</button></div>');
    h.push('</div></div>');
    return h.join('');
  }

  /* ================= Vista: Nivel ================= */
  function vistaNivel(nivel) {
    var nv = R.niveles.filter(function (x) { return x.nivel.id === nivel.id; })[0];
    var par = S.proyecto.parametros, cat = S.catalogo, serieDef = serieActual();
    var tipoDef = (cat.tiposCanasta.filter(function (t) { return t.id === par.tipo; })[0] || {}).nombre || '';
    var r = nv.resumen;
    var h = [];

    h.push('<div class="page-h"><div><h1>' + esc(nivel.nombre || '(sin nombre)') + '</h1><div class="meta">' +
      esc((S.proyecto.numero ? S.proyecto.numero + ' · ' : '') + S.proyecto.nombre) + ' · Reserva ' + fmt(par.reserva * 100, 0) + ' % · ' +
      esc(nombreSerie(serieDef)) + ' ' + esc(par.acabado) + ' · ' + esc(tipoDef) + ' · claro ' + fmt(par.claro, 2) + ' ft</div></div>' +
      '<div class="grow"></div><div class="toolbar"><label class="sub" style="font-size:12px;color:var(--ink-3)">Nombre del nivel</label>' +
      '<input class="in" style="width:200px" data-nv="' + nivel.id + '|nombre" value="' + esc(nivel.nombre) + '"></div></div>');

    h.push('<div class="kpis">' +
      kpi('Tramos con cables', r.tramos) + kpi('Cables', r.cables) +
      kpi('Errores ❌', r.errores, r.errores ? 'error' : '') + kpi('Advertencias ⚠', r.advertencias, r.advertencias ? 'warn' : '') +
      kpi('Longitud (m)', fmt(r.longitud, 1)) + kpi('Máx % NEC', fmtPct(r.maxNec), r.maxNec > 1 ? 'error' : r.maxNec > par.reserva ? 'warn' : '') +
      kpi('Máx % carga', fmtPct(r.maxCarga), r.maxCarga > 1 ? 'error' : '') +
      kpi('Máx % ocupación bruta', fmtPct(r.maxReal)) + '</div>');

    // ---- Tramos ----
    h.push('<div class="card"><div class="card-h"><h2>Tramos de canalización del nivel</h2><span class="sub">Canasta · escalera · ducto cuadrado</span><span class="grow"></span>' +
      '<button class="btn btn-primary btn-sm" data-act="tramo-agregar" data-nivel="' + nivel.id + '">＋ Agregar tramo</button></div>');
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead>');
    h.push('<tr><th class="grp" colspan="8">Entrada</th><th class="grp" colspan="13">Resultados</th><th class="grp" colspan="2"></th></tr>');
    h.push('<tr><th>#</th><th class="in-col">Sección o tramo</th><th class="in-col">Canalización</th><th class="in-col">Tipo (NEC 392)</th><th class="in-col">Claro (ft)</th><th class="in-col">Dist. (m)</th>' +
      '<th class="in-col">Tamaño seleccionado</th><th>Tamaño recomendado*</th>' +
      '<th class="n">Cables</th><th class="n">Área cables &lt; 4/0 (mm²)</th><th class="n">Σ diám. ≥ 4/0 Sd (mm)</th><th>Caso NEC</th>' +
      '<th class="n">Área permitida NEC (mm²)</th><th class="n">% llenado NEC</th><th class="n">Carga cables (lb/ft)</th><th class="n">Carga máx. (lb/ft)</th>' +
      '<th class="n">% carga</th><th class="n">% ocup. bruta+</th><th>Veredicto</th><th>Ref. fabricante seleccionada</th><th>Ref. recomendada</th><th></th><th></th></tr></thead><tbody>');
    if (!nv.tramos.length) h.push('<tr><td colspan="23" class="empty">Sin tramos. Use «Agregar tramo».</td></tr>');
    nv.tramos.forEach(function (t, i) {
      var tr = t.tramo, k = nivel.id + '|' + tr.id + '|', serie = t.serie, ducto = t.sistema === 'ducto';
      var serieSel = '<select class="cell w-l" data-t="' + k + 'serie">' + opcionesSeries(tr.serie, opt('', '(defecto) ' + nombreSerie(serieDef), !tr.serie)) + '</select>';
      var tipoSel = ducto ? '<span class="muted">n/a</span>' : '<select class="cell w-m" data-t="' + k + 'tipo">' + opt('', '(defecto) ' + tipoDef, !tr.tipo) +
        cat.tiposCanasta.map(function (x) { return opt(x.id, x.nombre, x.id === tr.tipo); }).join('') + '</select>';
      var claros = (serie.claros || []).map(Number);
      if (tr.claro !== '' && claros.indexOf(Number(tr.claro)) < 0) claros.push(Number(tr.claro));
      var claroDef = Calc.claroEfectivo(serie, { claro: '' }, par);
      var claroSel = '<select class="cell w-s" data-t="' + k + 'claro" data-type="num">' + opt('', '(def.) ' + fmt(claroDef, 2), tr.claro === '') +
        claros.map(function (c) { return opt(c, fmt(c, 2), Number(tr.claro) === Number(c) && tr.claro !== ''); }).join('') + '</select>';
      var lista = Calc.canastasDeSerie(R.cx, serie.id);
      if (t.seleccionada && lista.indexOf(t.seleccionada) < 0) lista.unshift(t.seleccionada);
      var canSel = '<select class="cell w-m" data-t="' + k + 'canasta"><option value="">— seleccione —</option>' +
        lista.map(function (c) { return opt(c.id, c.nombre + (c.serie !== serie.id ? ' (otra línea)' : ''), c.id === tr.canasta); }).join('') + '</select>';
      var reco = t.recomendada
        ? '<span class="reco">' + esc(t.recomendadaTexto) + (t.recomendada.id !== tr.canasta ? ' <button class="btn btn-sm use" data-act="tramo-usar-reco" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Usar el recomendado como seleccionado">usar</button>' : ' <span class="t-ok">✔</span>') + '</span>'
        : (t.recomendadaTexto ? '<span class="t-err">' + esc(t.recomendadaTexto) + '</span>' : '');
      var filtrado = S.filtroTramo[nivel.id] === tr.id;
      h.push('<tr' + (filtrado ? ' class="sel"' : '') + '><td><span class="num-badge">' + (i + 1) + '</span></td>' +
        '<td><input class="cell w-l" data-t="' + k + 'nombre" value="' + esc(tr.nombre) + '" placeholder="Tramo ' + (i + 1) + '"></td>' +
        '<td>' + serieSel + '</td><td>' + tipoSel + '</td><td>' + claroSel + '</td>' +
        '<td><input class="cell w-xs" data-t="' + k + 'distancia" data-type="num" value="' + esc(tr.distancia) + '"></td>' +
        '<td>' + canSel + '</td><td>' + reco + '</td>' +
        '<td class="n"><a href="#" data-act="filtrar-tramo" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Ver cables de este tramo">' + t.cables + '</a></td>' +
        '<td class="n">' + (t.cables && !ducto ? fmt(t.areaMenor, 1) : '') + '</td>' +
        '<td class="n">' + (t.cables && !ducto ? fmt(t.sd, 2) : '') + '</td>' +
        '<td class="muted">' + esc(t.casoTexto) + '</td>' +
        '<td class="n">' + (t.areaPermitida === 'n/a' ? 'n/a' : fmt(t.areaPermitida, 1)) + '</td>' +
        '<td class="n">' + pctCell(t.pctNec, Number(par.reserva), 1) + '</td>' +
        '<td class="n">' + (t.cables ? fmt(t.peso, 2) : '') + '</td>' +
        '<td class="n">' + fmt(t.cargaMax, 2) + '</td>' +
        '<td class="n">' + pctCell(t.pctCarga, null, 1) + '</td>' +
        '<td class="n">' + pctBruta(t.pctBruta, t.estadoBruta) + '</td>' +
        '<td>' + chip(t.veredicto, t.estado) + '</td>' +
        '<td class="muted">' + esc(t.refSeleccionada) + '</td>' +
        '<td class="muted">' + esc(t.refRecomendada) + '</td>' +
        '<td><button class="btn btn-sm" data-act="linea-agregar" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Agregar cable a este tramo">＋ cable</button></td>' +
        '<td><button class="btn-icon del" tabindex="-1" data-act="tramo-eliminar" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Eliminar tramo">✕</button></td></tr>');
    });
    h.push('</tbody></table></div>');
    h.push('<div class="legend">* Recomendado: el de menor sección de la línea del tramo que cumple a la vez el área NEC con la reserva de diseño (canasta/escalera: 392.22(A); Σ diámetros ≤ ancho para ≥ 4/0, o ≤ 90 % del ancho en fondo sólido; ducto: 376.22, ≤ ' + fmt(par.ductoFactor * 100, 0) + ' % de la sección) y la carga máxima del fabricante para el claro. ' +
      'La decisión final es la «seleccionada». + Ocupación bruta: área de todos los cables ÷ área interior útil (ancho real × min(alto, ' + esc(par.altoMax) + ' mm); ducto: sección completa). Solo referencia del fabricante; NO es el cumplimiento NEC.</div>');
    h.push('</div></div>');

    // ---- Cables ----
    var filtro = S.filtroTramo[nivel.id] || '';
    var numTramo = {};
    nivel.tramos.forEach(function (t, i) { numTramo[t.id] = i + 1; });
    var tramoOpts = function (sel) {
      return '<option value="">—</option>' + nivel.tramos.map(function (t, i) {
        return opt(t.id, (i + 1) + ' · ' + (t.nombre || 'Tramo ' + (i + 1)), t.id === sel);
      }).join('');
    };
    h.push('<div class="card"><div class="card-h"><h2>Cables por tramo</h2><span class="sub">Un tramo suma todas las líneas que lo tengan asignado.</span><span class="grow"></span>' +
      '<div class="toolbar"><label style="font-size:12px;color:var(--ink-3)">Mostrar</label><select class="in" data-filtro="' + nivel.id + '" style="max-width:260px">' +
      opt('', 'Todos los tramos', !filtro) + nivel.tramos.map(function (t, i) { return opt(t.id, (i + 1) + ' · ' + (t.nombre || 'Tramo ' + (i + 1)), t.id === filtro); }).join('') + '</select>' +
      '<button class="btn btn-primary btn-sm" data-act="linea-agregar" data-nivel="' + nivel.id + '" data-id="' + esc(filtro) + '">＋ Agregar línea</button>' +
      '<button class="btn btn-sm" data-act="linea-agregar5" data-nivel="' + nivel.id + '" data-id="' + esc(filtro) + '">＋ 5 líneas</button></div></div>');
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="in-col">Tramo</th><th class="in-col">Cable (descripción del catálogo)</th><th class="in-col n">Cant.</th>' +
      '<th class="n">Diám. (mm)</th><th class="n">Área unit. (mm²)</th><th>Clase NEC</th><th class="n">Área total (mm²)</th><th class="n">Σ diámetros (mm)</th><th class="n">Peso (lb/ft)</th><th>Aviso</th><th></th></tr></thead><tbody>');
    var visibles = 0;
    nivel.cables.forEach(function (l, i) {
      if (filtro && l.tramo !== filtro) return;
      visibles++;
      var c = nv.checks[i], d = c.datos, k = nivel.id + '|' + l.id + '|';
      h.push('<tr><td class="muted">' + (i + 1) + '</td>' +
        '<td><select class="cell w-m" data-l="' + k + 'tramo">' + tramoOpts(l.tramo) + '</select></td>' +
        celdasCable(l, k) +
        '<td><input class="cell w-xs" data-l="' + k + 'cant" data-type="num" value="' + esc(l.cant) + '"></td>' +
        '<td class="n">' + (d ? fmt(d.diam, 2) : '') + '</td>' +
        '<td class="n">' + (d ? fmt(d.areaUnit, 1) : '') + '</td>' +
        '<td class="muted">' + (d ? esc(d.clase) : '') + '</td>' +
        '<td class="n">' + (d ? fmt(d.areaTotal, 1) : '') + '</td>' +
        '<td class="n">' + (d ? fmt(d.sumaDiam, 2) : '') + '</td>' +
        '<td class="n">' + (d ? fmt(d.peso, 3) : '') + '</td>' +
        '<td>' + chip(c.aviso, c.nivel) + '</td>' +
        '<td><button class="btn-icon del" tabindex="-1" data-act="linea-eliminar" data-nivel="' + nivel.id + '" data-id="' + l.id + '" title="Eliminar línea">✕</button></td></tr>');
    });
    if (!visibles) h.push('<tr><td colspan="12" class="empty">' + (filtro ? 'Este tramo no tiene cables.' : 'Sin cables. Use «Agregar línea» o el botón «＋ cable» de un tramo.') + '</td></tr>');
    h.push('</tbody></table></div>');
    h.push('<div class="legend">Los cables 4/0 y mayores van en UNA sola capa. Los cables de control/señal no entran en el chequeo de área NEC. Verifique además la ampacidad (NEC 392.80(A)), soportes (392.30), curvas y separaciones.</div>');
    h.push('</div></div>');
    return h.join('');
  }

  /* Cable: un solo desplegable con la descripción del catálogo, de la marca de cable del proyecto,
   * agrupado por material y # de conductores y ordenado por calibre. */
  function celdasCable(l, k) {
    var cab = l.cable ? cablePorId(l.cable) : null;
    var lista = cablesDeMarca().slice();
    if (cab && lista.indexOf(cab) < 0) lista.push(cab);   // un cable de otra marca ya usado se conserva y se marca
    var A = function (c) { return Calc.atributosCable(c); };
    lista.sort(function (x, y) {
      var a = A(x), b = A(y);
      return (a.material === b.material ? 0 : a.material === 'Cu' ? -1 : 1) || ((a.conductores || 0) - (b.conductores || 0)) ||
        (Calc.ordenCalibre(a.calibre) - Calc.ordenCalibre(b.calibre)) || (parseInt(a.hilos || '0', 10) - parseInt(b.hilos || '0', 10));
    });
    var grupos = [], porClave = {};
    lista.forEach(function (c) {
      var a = A(c), clave = (NOMBRE_MATERIAL[a.material] || a.material || 'Otro') + ' · ' + (a.conductores || '?') + ' conductores';
      if (!porClave[clave]) { porClave[clave] = { t: clave, items: [] }; grupos.push(porClave[clave]); }
      porClave[clave].items.push(c);
    });
    var fab = S.proyecto.parametros.fabricanteCable;
    var h = '<td><select class="cell w-xl" data-l="' + k + 'cable"><option value="">— elija el cable —</option>' +
      grupos.map(function (g) {
        return '<optgroup label="' + esc(g.t) + '">' + g.items.map(function (c) {
          return opt(c.id, c.nombre + (fab && c.fabricante !== fab ? ' (otra marca)' : ''), c.id === l.cable);
        }).join('') + '</optgroup>';
      }).join('') + '</select></td>';
    return h;
  }

  function kpi(k, v, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + (v === '' || v === null || v === undefined ? '—' : v) + '</div></div>';
  }

  /* ================= Vista: Memoria de cálculo ================= */
  function vistaMemoria() {
    var p = S.proyecto, par = p.parametros, cat = S.catalogo, serieDef = serieActual();
    var tipoDef = (cat.tiposCanasta.filter(function (t) { return t.id === par.tipo; })[0] || {}).nombre || '';
    var pc = function (v) { return fmt(v * 100, 0) + ' %'; };
    var h = [];
    h.push('<div class="memoria">');
    h.push('<div class="print-h"><h1>Memoria de cálculo — canalizaciones portacables (cable MC)</h1><div class="sub">' +
      esc([(p.numero ? p.numero + ' · ' : '') + (p.nombre || ''), p.ubicacion, p.fecha].filter(Boolean).join(' · ')) +
      '<br>NEC 2020 Art. 392.22(A) canasta y escalera · Art. 376.22 ducto cuadrado</div></div>');
    h.push('<div class="page-h"><div><h1>Memoria de cálculo</h1><div class="meta">Resumen del edificio, lista de materiales y detalle de tramos por nivel.</div></div><div class="grow"></div>' +
      '<div class="toolbar no-print"><button class="btn btn-primary" data-act="xlsx">Descargar Excel (.xlsx)</button><button class="btn" data-act="csv-detalle">Exportar detalle (CSV)</button><button class="btn" data-act="csv-materiales">Exportar materiales (CSV)</button>' +
      '<button class="btn" data-act="imprimir">Imprimir / PDF</button></div></div>');

    var t = R.total;
    h.push('<div class="kpis">' + kpi('Niveles', R.niveles.length) + kpi('Tramos con cables', t.tramos) + kpi('Cables', t.cables) +
      kpi('Errores ❌', t.errores, t.errores ? 'error' : '') + kpi('Advertencias ⚠', t.advertencias, t.advertencias ? 'warn' : '') +
      kpi('Longitud canasta (m)', fmt(t.longitud, 1)) + kpi('Máx % NEC', fmtPct(t.maxNec), t.maxNec > 1 ? 'error' : t.maxNec > par.reserva ? 'warn' : '') +
      kpi('Máx % carga', fmtPct(t.maxCarga), t.maxCarga > 1 ? 'error' : '') +
      kpi('Máx % ocupación bruta', fmtPct(t.maxReal)) + '</div>');

    // Datos + criterios
    var fila = function (a, b) { return '<tr><td class="muted" style="width:230px">' + a + '</td><td style="white-space:normal">' + b + '</td></tr>'; };
    h.push('<section class="card"><div class="card-h"><h2>Datos del proyecto y criterios de diseño</h2></div><div class="card-b flush"><table class="tbl"><tbody>' +
      fila('Proyecto # / Project #', esc(p.numero)) + fila('Nombre / Name', esc(p.nombre)) + fila('Ubicación / Location', esc(p.ubicacion)) +
      fila('Fecha / Date', esc(p.fecha)) + fila('Elaboró / Prepared by', esc(p.elaboro)) +
      fila('Área NEC 392.22(A)', '(b) Cables &lt; 4/0: Σ áreas ≤ Col. 1 (escalera / ventilada, (A)(1)) o Col. 3 (fondo sólido, (A)(3)). (c) Mezcla con ≥ 4/0: Σ áreas &lt; 4/0 ≤ Col. 2 − ' + esc(par.sdVentilada) + '·Sd o Col. 4 − ' + esc(par.sdSolido) + '·Sd. (a) Solo ≥ 4/0: una capa, Σ diámetros ≤ ancho (fondo sólido: ≤ 90 % del ancho).') +
      fila('Reserva de diseño', fmt(par.reserva * 100, 0) + ' % del área permitida por NEC como máximo (' + (par.reserva >= 1 ? 'sin reserva' : 'reserva de ' + fmt((1 - par.reserva) * 100, 0) + ' %') + ')') +
      fila('Ducto cuadrado — NEC 376.22', 'Σ áreas de todos los cables ≤ ' + pc(par.ductoFactor) + ' de la sección interior del ducto. Con más de ' + esc(par.ductoMaxConductores) + ' conductores portadores de corriente se aplican los factores de ajuste de 310.15(C)(1).') +
      fila('Carga / claro', 'Carga real de los cables (lb/ft) ≤ carga máxima admisible del fabricante para el claro entre soportes del tramo (según la línea de producto).') +
      fila('Ocupación bruta', 'Área de todos los cables ÷ área interior útil (canasta/escalera: ancho real × min(alto, ' + esc(par.altoMax) + ' mm); ducto: sección completa). Referencia del fabricante (factor de llenado); NO es el cumplimiento NEC.') +
      fila('Tipo / claro por defecto', esc(tipoDef) + ' · ' + fmt(par.claro, 2) + ' ft') +
      fila('Canalización por defecto', esc(nombreSerie(serieDef)) + ' — acabado ' + esc(par.acabado)) +
      fila('Marca de cable', esc((cat.fabricantesCable.filter(function (f) { return f.id === par.fabricanteCable; })[0] || {}).nombre || '')) +
      fila('Limitaciones', 'No incluye ampacidad (NEC 392.80(A)), soportes (392.30) ni curvas. Cables de control/señal: fuera del chequeo de área NEC. Verifique la tabla 392.22(A) contra la edición vigente.') +
      '</tbody></table></div></section>');

    // Niveles
    h.push('<section class="card ancha"><div class="card-h"><h2>Niveles del edificio</h2><span class="sub">Building levels</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>#</th><th>Nivel / Level</th><th class="n">Tramos</th><th class="n">Cables</th><th class="n">Errores ❌</th><th class="n">Advertencias ⚠</th><th class="n">Long. (m)</th><th class="n">Máx % NEC</th><th class="n">Máx % carga</th><th class="n">Máx % ocup. bruta</th></tr></thead><tbody>');
    R.niveles.forEach(function (nv, i) {
      var r = nv.resumen;
      h.push('<tr><td>' + (i + 1) + '</td><td><a href="#" data-vista="nivel:' + nv.nivel.id + '">' + esc(nv.nivel.nombre) + '</a></td><td class="n">' + r.tramos + '</td><td class="n">' + r.cables + '</td>' +
        '<td class="n ' + (r.errores ? 't-err' : '') + '">' + r.errores + '</td><td class="n ' + (r.advertencias ? 't-warn' : '') + '">' + r.advertencias + '</td>' +
        '<td class="n">' + fmt(r.longitud, 1) + '</td><td class="n">' + pctCell(r.maxNec, Number(par.reserva), 1) + '</td><td class="n">' + pctCell(r.maxCarga, null, 1) + '</td><td class="n">' + fmtPct(r.maxReal) + '</td></tr>');
    });
    h.push('</tbody><tfoot><tr><td></td><td>TOTAL EDIFICIO</td><td class="n">' + t.tramos + '</td><td class="n">' + t.cables + '</td><td class="n">' + t.errores + '</td><td class="n">' + t.advertencias + '</td><td class="n">' + fmt(t.longitud, 1) +
      '</td><td class="n">' + fmtPct(t.maxNec) + '</td><td class="n">' + fmtPct(t.maxCarga) + '</td><td class="n">' + fmtPct(t.maxReal) + '</td></tr></tfoot></table></div></div></section>');

    // Canastas
    h.push('<section class="card"><div class="card-h"><h2>Canalizaciones seleccionadas — tramos por tamaño</h2><span class="sub">Lista de materiales de canasta, escalera y ducto</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Marca / Brand</th><th>Tipo</th><th>Tamaño / Size</th><th>Número de parte / P/N</th><th class="n">Tramos</th><th class="n">Longitud (m)</th><th class="n">Largo de pieza (m)</th><th class="n">Piezas</th></tr></thead><tbody>');
    if (!R.bomCanastas.length) h.push('<tr><td colspan="8" class="empty">Sin tramos con tamaño seleccionado.</td></tr>');
    var totL = 0, totP = 0;
    R.bomCanastas.forEach(function (b) {
      var l = Number(b.serie && b.serie.largoPieza) || 3;
      var piezas = Math.ceil(b.longitud / l);
      totL += b.longitud; totP += piezas;
      h.push('<tr><td>' + esc(b.marca ? b.marca.nombre : '') + '</td><td>' + esc(Calc.SISTEMAS[b.serie.sistema] || '') + '</td><td>' + esc(b.canasta.nombre) + '</td><td>' + esc(b.referencia) + '</td><td class="n">' + b.tramos + '</td><td class="n">' + fmt(b.longitud, 1) + '</td><td class="n">' + fmt(l, 2) + '</td><td class="n">' + piezas + '</td></tr>');
    });
    h.push('</tbody>' + (R.bomCanastas.length ? '<tfoot><tr><td colspan="5">TOTAL</td><td class="n">' + fmt(totL, 1) + '</td><td></td><td class="n">' + totP + '</td></tr></tfoot>' : '') + '</table></div></div></section>');

    // Cables
    var fabs = {};
    cat.fabricantesCable.forEach(function (f) { fabs[f.id] = f.nombre; });
    h.push('<section class="card ancha"><div class="card-h"><h2>Cables por tipo</h2><span class="sub">Longitud estimada = cantidad × distancia del tramo (sin colas ni subidas)</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Material</th><th class="n"># cond.</th><th>Calibre</th><th>Cable (referencia)</th><th>Fabricante</th><th>Clase NEC</th><th class="n">Cantidad (corridas)</th><th class="n">Longitud estimada (m)</th><th class="n">Peso estimado (kg)</th></tr></thead><tbody>');
    if (!R.bomCables.length) h.push('<tr><td colspan="9" class="empty">Sin cables asignados.</td></tr>');
    R.bomCables.forEach(function (b) {
      var at = Calc.atributosCable(b.cable);
      h.push('<tr><td>' + esc(NOMBRE_MATERIAL[at.material] || at.material) + '</td><td class="n">' + esc(at.conductores) + 'C</td><td>' + esc(at.calibre) + '</td><td>' + esc(b.cable.nombre) + '</td><td>' + esc(fabs[b.cable.fabricante] || '') + '</td><td class="muted">' + esc(b.cable.clase) + '</td><td class="n">' + fmt(b.cantidad, 0) + '</td><td class="n">' + fmt(b.longitud, 1) + '</td><td class="n">' + fmt(b.peso * 0.45359237, 1) + '</td></tr>');
    });
    h.push('</tbody></table></div></div></section>');

    // Detalle
    h.push('<section class="card ancha"><div class="card-h"><h2>Detalle de tramos por nivel</h2><span class="sub">Solo tramos en uso / only segments in use</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Nivel</th><th>#</th><th>Sección</th><th>Canalización</th><th>Tipo</th><th class="n">Cables</th><th class="n">Área cables (mm²)</th><th>Tamaño seleccionado</th><th>Referencia / P/N</th><th class="n">% llenado NEC</th><th class="n">% carga</th><th class="n">% ocup. bruta</th><th>Veredicto</th><th class="n">Dist. (m)</th></tr></thead><tbody>');
    if (!R.detalle.length) h.push('<tr><td colspan="14" class="empty">Sin tramos en uso.</td></tr>');
    R.detalle.forEach(function (d) {
      var x = d.r;
      h.push('<tr><td>' + esc(d.nivel.nombre) + '</td><td>' + d.num + '</td><td>' + esc(x.tramo.nombre || '(sin nombre)') + '</td><td>' + esc(marcaDe(x.serie.marca).nombre + ' · ' + (Calc.SISTEMAS[x.sistema] || '')) + '</td><td class="muted">' + esc(x.tipoNombre) + '</td>' +
        '<td class="n">' + x.cables + '</td><td class="n">' + fmt(x.areaTotal, 1) + '</td><td>' + esc(x.seleccionada ? x.seleccionada.nombre : 'Sin selección') + '</td><td>' + esc(x.refSeleccionada) + '</td>' +
        '<td class="n">' + pctCell(x.pctNec, Number(par.reserva), 1) + '</td><td class="n">' + pctCell(x.pctCarga, null, 1) + '</td><td class="n">' + pctBruta(x.pctBruta, x.estadoBruta) + '</td><td>' + chip(x.veredicto, x.estado) + '</td><td class="n">' + fmt(x.tramo.distancia, 1) + '</td></tr>');
    });
    h.push('</tbody></table></div></div></section>');
    h.push('</div>');
    return h.join('');
  }

  /* ================= Vista: Ayuda ================= */
  function vistaAyuda() {
    var items = [
      ['A', 'PROYECTO — pestaña Proyecto: número, nombre, ubicación, reserva de diseño (% máx. del área NEC), canalización por defecto (marca · tipo), acabado, marca de cable, claro, tipo de canasta y criterios del ducto cuadrado. Aplican a todo el edificio.'],
      ['B', 'NIVELES — en la pestaña Proyecto agregue los niveles del edificio (uno por uno o en serie). Cada nivel crea su propia pestaña. Puede renombrarlos, ordenarlos, duplicarlos o eliminarlos.'],
      ['C', 'TRAMOS — tabla superior de cada nivel: nombre del tramo, canalización (canasta, escalera o ducto cuadrado de Cablofil, Eaton o Schneider), tipo, claro, distancia y tamaño seleccionado. Celdas VERDES = entrada manual. Deje canalización/tipo/claro en «(defecto)» para usar los del proyecto.'],
      ['D', 'CABLES — lista inferior: tramo, cable (un solo desplegable con la descripción del catálogo, de la marca de cable del proyecto, agrupado por material y # de conductores) y cantidad. Un tramo suma todas las líneas asignadas.'],
      ['E', 'TAMAÑO RECOMENDADO — el de menor sección de la línea del tramo que cumple el área NEC (con la reserva de diseño) y la carga máx. por claro. Con «usar» lo copia al seleccionado.'],
      ['F', '% LLENADO NEC — canasta y escalera (NEC 392.22(A)): Σ áreas < 4/0 ÷ área permitida (Col. 1/3, o Col. 2/4 − 30·Sd / 25·Sd con mezcla); solo cables ≥ 4/0: Σ diámetros ÷ ancho (fondo sólido: 90 % del ancho). Ducto cuadrado (NEC 376.22): Σ áreas de todos los cables ÷ 20 % de la sección. Naranja > reserva, rojo > 100 %.'],
      ['G', '% CARGA — peso real de los cables (lb/ft) ÷ carga máxima admisible para el claro del tramo. Rojo si excede 100 %. Carga 0 en el catálogo = claro no publicado por el fabricante (no permitido).'],
      ['H', '% OCUPACIÓN BRUTA — área de todos los cables ÷ área interior útil (ancho × min(alto, 150 mm); ducto: sección completa). Solo referencia del fabricante (factor 0,5 / 0,6 / 0,7 en canastas Cablofil); naranja si lo supera.'],
      ['I', 'VEREDICTO — ❌ NO CUMPLE (área NEC, ancho o peso/claro) · ⚠ advertencia (supera la reserva de diseño, más de 30 conductores portadores en ducto u ocupación bruta > fabricante) · ✔ CUMPLE.'],
      ['J', 'MEMORIA DE CÁLCULO — consolida niveles, errores, longitudes, metros y piezas por tamaño (canasta, escalera y ducto), cables por tipo y el detalle de cada tramo. Se imprime con el formato Sinergia (membrete, carta) o se descarga en Excel.'],
      ['K', 'LIMITACIONES — no se calcula la ampacidad (NEC 392.80(A)), soportes (392.30 / 376.30) ni curvas. Los tramos con solo cables de control/señal (392.22(A)(2) y (A)(4)) no se verifican. Vea el resumen de la norma más abajo y verifique contra la edición vigente.'],
      ['L', 'CATÁLOGOS — marcas, líneas de producto (claros y acabados), tamaños, cables, fabricantes, tipos de canasta y tabla NEC se administran en la pestaña Administración (solo con permisos de administrador).'],
      ['M', 'DATOS — en esta versión los proyectos se guardan en este navegador. Use «Proyecto ▾ → Exportar» para respaldar o compartir un proyecto (.json). En la siguiente fase se conectará a la base de datos Supabase.']
    ];
    var h = ['<div class="page-h"><div><h1>Ayuda</h1><div class="meta">Cómo usar la herramienta</div></div></div>'];
    h.push('<div class="card"><div class="card-b"><div class="help-list">' + items.map(function (it) {
      return '<div class="help-item"><b class="l">' + it[0] + '</b><div>' + esc(it[1]) + '</div></div>';
    }).join('') + '</div></div></div>');
    h.push(resumenNorma());
    return h.join('');
  }

  /* Resumen de los artículos NEC que aplica la herramienta (NEC 2020; verifique la edición que rige el proyecto) */
  function resumenNorma() {
    var IN2 = { 50: [2.5, 2.0], 100: [4.5, 3.5], 150: [7.0, 5.5], 200: [9.5, 7.0], 225: [10.5, 8.0], 300: [14.0, 11.0], 400: [18.5, 14.5], 450: [21.0, 16.5], 500: [23.5, 18.5], 600: [28.0, 22.0], 750: [35.0, 27.5], 900: [42.0, 33.0] };
    var art = function (titulo, puntos) {
      return '<div class="norma"><h3>' + titulo + '</h3><ul>' + puntos.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul></div>';
    };
    var h = ['<div class="card"><div class="card-h"><h2>Resumen de la norma — NEC 2020</h2><span class="sub">Resumen de referencia; el texto que rige es el del código vigente para el proyecto.</span></div><div class="card-b">'];
    h.push(art('392.22(A) — Número de cables multiconductores de 2000 V o menos en bandejas portacables', [
      'El número de cables en una bandeja no debe exceder lo de esta sección. Los calibres aplican igual a conductores de cobre y de aluminio.',
      'Con separadores divisorios, el cálculo de ocupación se hace para cada sección dividida de la bandeja.'
    ]));
    h.push(art('392.22(A)(1) — Escalera o fondo ventilado, cualquier combinación de cables (fuerza, iluminación, control y señal)', [
      '<b>(a) Todos 4/0 AWG o mayores:</b> la suma de diámetros no debe exceder el ancho de la bandeja, y los cables van en una sola capa. Si la ampacidad se determina por 392.80(A)(1)(c), el ancho no debe ser menor que la suma de diámetros más la separación requerida entre cables.',
      '<b>(b) Todos menores de 4/0 AWG:</b> la suma de áreas transversales no debe exceder la Columna 1 de la Tabla 392.22(A) para el ancho de la bandeja.',
      '<b>(c) Mezcla de cables 4/0 AWG o mayores con menores:</b> la suma de áreas de los menores de 4/0 no debe exceder la Columna 2 (Columna 1 − 30·Sd). Los de 4/0 y mayores van en una sola capa y no se colocan otros cables encima.'
    ]));
    h.push(art('392.22(A)(2) — Escalera o fondo ventilado con solo cables de control y/o señalización', [
      'Con profundidad interior útil de 150 mm (6 in) o menos, la suma de áreas de todos los cables no debe exceder el 50 % del área de la sección interior. Para bandejas más profundas se calcula con 150 mm.',
      'La herramienta no verifica este caso: los tramos con solo cables de control/señal se marcan como «solo control/señal».'
    ]));
    h.push(art('392.22(A)(3) — Fondo sólido, cualquier combinación de cables', [
      '<b>(a) Todos 4/0 AWG o mayores:</b> la suma de diámetros no debe exceder el 90 % del ancho de la bandeja, en una sola capa.',
      '<b>(b) Todos menores de 4/0 AWG:</b> la suma de áreas no debe exceder la Columna 3 de la Tabla 392.22(A).',
      '<b>(c) Mezcla:</b> la suma de áreas de los menores de 4/0 no debe exceder la Columna 4 (Columna 3 − 25·Sd). Los de 4/0 y mayores van en una sola capa.',
      '<b>(A)(4) Fondo sólido con solo control/señal:</b> la suma de áreas no debe exceder el 40 % del área interior (profundidad de cálculo máx. 150 mm). No se verifica en la herramienta.'
    ]));
    // Tabla 392.22(A)
    h.push('<h3 class="norma-tabla">Tabla 392.22(A) — Área de ocupación permisible para cables multiconductores de 2000 V nominales o menos</h3>');
    h.push('<div class="tbl-wrap"><table class="tbl"><thead>' +
      '<tr><th colspan="2" class="grp">Ancho interior de la bandeja</th><th colspan="4" class="grp">Escalera o fondo ventilado — 392.22(A)(1)</th><th colspan="4" class="grp">Fondo sólido — 392.22(A)(3)</th></tr>' +
      '<tr><th class="n">mm</th><th class="n">pulg.</th><th class="n">Col. 1 (mm²)</th><th class="n">Col. 1 (pulg.²)</th><th>Col. 2ª (mm²)</th><th>Col. 2ª (pulg.²)</th>' +
      '<th class="n">Col. 3 (mm²)</th><th class="n">Col. 3 (pulg.²)</th><th>Col. 4ª (mm²)</th><th>Col. 4ª (pulg.²)</th></tr></thead><tbody>' +
      S.catalogo.nec.map(function (r) {
        var i2 = IN2[Number(r.anchoMm)] || [null, null];
        return '<tr><td class="n">' + r.anchoMm + '</td><td class="n">' + fmt(r.anchoIn, 1) + '</td><td class="n">' + fmt(r.col1, 0) + '</td><td class="n">' + fmt(i2[0], 1) + '</td>' +
          '<td>' + fmt(r.col1, 0) + ' − (30 Sd)</td><td>' + fmt(i2[0], 1) + ' − (1.2 Sd)</td>' +
          '<td class="n">' + fmt(r.col3, 0) + '</td><td class="n">' + fmt(i2[1], 1) + '</td><td>' + fmt(r.col3, 0) + ' − (25 Sd)</td><td>' + fmt(i2[1], 1) + ' − Sd</td></tr>';
      }).join('') + '</tbody></table></div>');
    h.push('<div class="legend">ª Las columnas 2 y 4 se calculan: por ejemplo, para una bandeja de 150 mm la Columna 2 es 4 500 − (30 × Sd) mm² [en pulgadas: 7 − (1.2 × Sd)]. ' +
      'Sd = suma de los diámetros (mm; en pulg. para pulg.²) de todos los cables multiconductores 4/0 AWG (107.2 mm²) y mayores instalados en la misma bandeja con cables de menor tamaño. ' +
      'Columna 1 aplica a 392.22(A)(1)(b), Columna 2 a (A)(1)(c), Columna 3 a (A)(3)(b) y Columna 4 a (A)(3)(c).</div>');
    h.push(art('392.80(A)(1) — Ampacidad de cables multiconductores de 2000 V o menos en bandejas', [
      'La ampacidad de cables instalados según 392.22(A) es la de las Tablas 310.15(B)(16) y 310.15(B)(18) (310.16 y 310.18 en NEC 2020), sujeta a lo siguiente:',
      '<b>(a)</b> Los factores de ajuste de 310.15(B)(3)(a) (310.15(C)(1) en NEC 2020) aplican solo a cables con más de tres conductores portadores de corriente, y se limitan al número de conductores del cable, no al de la bandeja.',
      '<b>(b)</b> Si la bandeja tiene tapa sólida no ventilada continua por más de 1.8 m (6 ft), se permite como máximo el 95 % de esas ampacidades.',
      '<b>(c)</b> Cables en una sola capa, en bandeja sin tapa y con separación mantenida de al menos un diámetro entre cables: la ampacidad no debe exceder la de cables de hasta tres conductores al aire libre, corregida por temperatura ambiente según 310.15(C).',
      'La herramienta no calcula ampacidad: verifíquela aparte.'
    ]));
    h.push(art('376.22 — Número de conductores y área de ocupación en ductos cuadrados (wireways) metálicos', [
      '<b>(A)</b> La suma de las áreas transversales de todos los conductores en cualquier sección del ducto no debe exceder el 20 % del área interior de esa sección.',
      '<b>(B)</b> Los factores de ajuste de 310.15(C)(1) aplican solo cuando hay más de 30 conductores portadores de corriente en cualquier sección del ducto. La herramienta advierte (⚠) cuando se supera ese número.'
    ]));
    h.push('</div></div>');
    return h.join('');
  }

  /* ================= Vista: Administración ================= */
  function vistaAdmin() {
    var subs = [['canastas', 'Tamaños de canalización'], ['series', 'Líneas de producto'], ['marcas', 'Marcas'], ['cables', 'Cables'], ['fabricantes', 'Fabricantes de cable'], ['tipos', 'Tipos de canasta'], ['nec', 'Tabla NEC'], ['respaldo', 'Respaldo y seguridad']];
    var h = ['<div class="page-h"><div><h1>Administración de catálogos</h1><div class="meta">Marcas, tipos de canasta y tipos de cable disponibles para todos los proyectos. Catálogo actualizado: ' + esc(S.catalogo.actualizado || '') + '</div></div></div>'];
    h.push('<div class="admin-banner">Los cambios se guardan automáticamente y afectan los cálculos de todos los proyectos de este navegador. ' +
      'Antes de eliminar un elemento verifique que ningún proyecto lo use. Use «Respaldo» para exportar el catálogo y compartirlo.</div>');
    h.push('<div class="subtabs">' + subs.map(function (s) { return '<button class="subtab' + (S.adminSub === s[0] ? ' active' : '') + '" data-act="admin-sub" data-id="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>');
    var f = { canastas: adminCanastas, series: adminSeries, marcas: adminMarcas, cables: adminCables, fabricantes: adminFabricantes, tipos: adminTipos, nec: adminNec, respaldo: adminRespaldo }[S.adminSub];
    h.push(f());
    return h.join('');
  }
  function aIn(col, id, campo, val, tipo, cls) {
    return '<input class="cell ' + (cls || '') + '" data-a="' + col + '|' + id + '|' + campo + '"' + (tipo ? ' data-type="' + tipo + '"' : '') + ' value="' + esc(Array.isArray(val) ? val.join(', ') : val) + '">';
  }
  function aSel(col, id, campo, val, opciones, cls) {
    return '<select class="cell ' + (cls || '') + '" data-a="' + col + '|' + id + '|' + campo + '">' + opciones.map(function (o) { return opt(o[0], o[1], o[0] === val); }).join('') + '</select>';
  }
  function aDel(col, id) { return '<button class="btn-icon del" tabindex="-1" data-act="admin-del" data-col="' + col + '" data-id="' + id + '" title="Eliminar">✕</button>'; }

  function adminCanastas() {
    var cat = S.catalogo, fm = S.adminFiltro.serie || (cat.series[0] || {}).id;
    var serie = serieDe(fm) || VACIA, ducto = serie.sistema === 'ducto';
    var lista = cat.canastas.filter(function (c) { return c.serie === fm; }).sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
    var necIdx = {};
    cat.nec.forEach(function (r) { necIdx[r.anchoMm] = r; });
    var h = ['<div class="card"><div class="card-h"><h2>Tamaños de canalización</h2><span class="sub">El «orden» define cuál es el recomendado: se elige el primero que cumple. Ordene de menor a mayor sección.</span><span class="grow"></span>' +
      '<div class="toolbar"><label style="font-size:12px;color:var(--ink-3)">Línea</label><select class="in" data-act-change="admin-filtro-serie">' + opcionesSeries(fm) + '</select>' +
      '<button class="btn btn-sm" data-act="admin-ordenar">Ordenar por sección</button><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="canastas">＋ Agregar tamaño</button></div></div>'];
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="n">Orden</th><th>Nombre</th><th class="n">Ancho nom. (mm)</th><th class="n">Alto nom. (mm)</th><th class="n">Ancho real (mm)</th><th class="n">Alto / profundidad útil (mm)</th>' +
      (serie.claros || []).map(function (c) { return '<th class="n">Carga máx. @ ' + fmt(c, 2) + ' ft (lb/ft)</th>'; }).join('') +
      '<th>Familia</th><th>Código base</th><th class="n">' + (ducto ? 'Sección (mm²)' : 'NEC Col.1 / Col.3') + '</th><th></th></tr></thead><tbody>');
    if (!lista.length) h.push('<tr><td colspan="20" class="empty">Esta línea no tiene tamaños. Agregue el primero.</td></tr>');
    lista.forEach(function (c) {
      var n = necIdx[c.anchoNom];
      var ref = ducto ? '<td class="n muted">' + fmt(Number(c.anchoReal) * Number(c.altoReal), 0) + '</td>'
        : '<td class="n ' + (n ? 'muted' : 't-err') + '">' + (n ? fmt(n.col1, 0) + ' / ' + fmt(n.col3, 0) : 'sin fila NEC') + '</td>';
      h.push('<tr><td>' + aIn('canastas', c.id, 'orden', c.orden, 'num', 'w-xs') + '</td><td>' + aIn('canastas', c.id, 'nombre', c.nombre, '', 'w-m') + '</td>' +
        '<td>' + aIn('canastas', c.id, 'anchoNom', c.anchoNom, 'num', 'w-xs') + '</td><td>' + aIn('canastas', c.id, 'altoNom', c.altoNom, 'num', 'w-xs') + '</td>' +
        '<td>' + aIn('canastas', c.id, 'anchoReal', c.anchoReal, 'num', 'w-xs') + '</td><td>' + aIn('canastas', c.id, 'altoReal', c.altoReal, 'num', 'w-xs') + '</td>' +
        (serie.claros || []).map(function (_, k) { return '<td>' + aIn('canastas', c.id, 'cargas.' + k, (c.cargas || [])[k], 'num', 'w-xs') + '</td>'; }).join('') +
        '<td>' + aIn('canastas', c.id, 'familia', c.familia, '', 'w-s') + '</td><td>' + aIn('canastas', c.id, 'codigo', c.codigo, '', 'w-m') + '</td>' +
        ref + '<td>' + aDel('canastas', c.id) + '</td></tr>');
    });
    h.push('</tbody></table></div><div class="legend">Referencia del fabricante = código base + acabado. ' +
      (ducto ? 'Ducto cuadrado: NEC 376.22 usa la sección interior (ancho real × alto real); no requiere fila en la Tabla NEC. Deje las cargas en blanco si el fabricante no publica carga por claro.'
        : 'El ancho nominal debe existir en la Tabla NEC 392.22. Las cargas corresponden a los claros definidos en la línea de producto.') + '</div></div></div>');
    return h.join('');
  }
  function adminSeries() {
    var cat = S.catalogo;
    var marcas = cat.marcas.map(function (m) { return [m.id, m.nombre]; });
    var sistemas = Object.keys(Calc.SISTEMAS).map(function (k) { return [k, Calc.SISTEMAS[k]]; });
    var h = ['<div class="card"><div class="card-h"><h2>Líneas de producto</h2><span class="sub">Marca + tipo de canalización: cada línea tiene sus claros, acabados y tamaños.</span><span class="grow"></span><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="series">＋ Agregar línea</button></div>'];
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Marca</th><th>Tipo</th><th>Nombre de la línea</th><th>Acabados (coma)</th><th>Claros de carga (ft, coma)</th><th class="n">Largo de pieza (m)</th><th>Nota / fuente</th><th class="n">Tamaños</th><th></th></tr></thead><tbody>');
    cat.series.forEach(function (s) {
      var n = cat.canastas.filter(function (c) { return c.serie === s.id; }).length;
      h.push('<tr><td>' + aSel('series', s.id, 'marca', s.marca, marcas, 'w-m') + '</td><td>' + aSel('series', s.id, 'sistema', s.sistema, sistemas, 'w-s') + '</td>' +
        '<td>' + aIn('series', s.id, 'nombre', s.nombre, '', 'w-l') + '</td><td>' + aIn('series', s.id, 'acabados', s.acabados, 'lista', 'w-s') + '</td>' +
        '<td>' + aIn('series', s.id, 'claros', s.claros, 'listanum', 'w-m') + '</td><td>' + aIn('series', s.id, 'largoPieza', s.largoPieza || 3, 'num', 'w-xs') + '</td>' +
        '<td>' + aIn('series', s.id, 'nota', s.nota, '', 'w-xl') + '</td><td class="n">' + n + '</td><td>' + aDel('series', s.id) + '</td></tr>');
    });
    h.push('</tbody></table></div><div class="legend">Canasta y escalera se calculan con NEC 392.22(A); el ducto cuadrado con NEC 376.22. Si cambia la cantidad de claros, revise las cargas de cada tamaño (una columna por claro, en el mismo orden).</div></div></div>');
    return h.join('');
  }
  function adminMarcas() {
    var cat = S.catalogo;
    var h = ['<div class="card"><div class="card-h"><h2>Marcas de canalización</h2><span class="grow"></span><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="marcas">＋ Agregar marca</button></div>'];
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Líneas de producto</th><th></th></tr></thead><tbody>');
    cat.marcas.forEach(function (m) {
      var lineas = cat.series.filter(function (s) { return s.marca === m.id; }).map(function (s) { return Calc.SISTEMAS[s.sistema] || s.sistema; });
      h.push('<tr><td>' + aIn('marcas', m.id, 'nombre', m.nombre, '', 'w-l') + '</td><td class="muted">' + esc(lineas.join(' · ') || '—') + '</td><td>' + aDel('marcas', m.id) + '</td></tr>');
    });
    h.push('</tbody></table></div></div></div>');
    return h.join('');
  }
  function adminCables() {
    var cat = S.catalogo, F = S.adminFiltro;
    var fabs = cat.fabricantesCable.map(function (f) { return [f.id, f.nombre]; });
    var clases = Calc.CLASES.map(function (c) { return [c, c]; });
    var txt = (F.texto || '').toLowerCase();
    var lista = cat.cables.filter(function (c) {
      return (!F.fab || c.fabricante === F.fab) && (!F.clase || c.clase === F.clase) && (!txt || c.nombre.toLowerCase().indexOf(txt) >= 0);
    });
    var h = ['<div class="card"><div class="card-h"><h2>Cables (tipos de cableado)</h2><span class="sub">' + lista.length + ' de ' + cat.cables.length + '</span><span class="grow"></span><div class="toolbar">' +
      '<input class="in" data-filtro="admin-texto" placeholder="Buscar…" value="' + esc(F.texto) + '" style="width:180px">' +
      '<select class="in" data-filtro="admin-fab">' + opt('', 'Todos los fabricantes', !F.fab) + fabs.map(function (f) { return opt(f[0], f[1], f[0] === F.fab); }).join('') + '</select>' +
      '<select class="in" data-filtro="admin-clase">' + opt('', 'Todas las clases', !F.clase) + clases.map(function (c) { return opt(c[0], c[1], c[0] === F.clase); }).join('') + '</select>' +
      '<button class="btn btn-primary btn-sm" data-act="admin-add" data-col="cables">＋ Agregar cable</button></div></div>'];
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre / descripción</th><th>Fabricante</th><th>Material</th><th class="n"># cond.</th><th>Calibre</th><th>Hilos</th><th>Aislamiento</th><th>Artículo</th><th>Clase NEC</th><th class="n">Peso (lb/1000 ft)</th><th class="n">Diámetro ext. (mm)</th><th class="n">Diámetro (in)</th><th class="n">Área (mm²)</th><th></th></tr></thead><tbody>');
    lista.forEach(function (c) {
      h.push('<tr><td>' + aIn('cables', c.id, 'nombre', c.nombre, '', 'w-xl') + '</td><td>' + aSel('cables', c.id, 'fabricante', c.fabricante, fabs, 'w-s') + '</td>' +
        '<td>' + aSel('cables', c.id, 'material', c.material, [['Cu', 'Cobre (Cu)'], ['Al', 'Aluminio (Al)']], 'w-s') + '</td>' +
        '<td>' + aIn('cables', c.id, 'conductores', c.conductores, 'num', 'w-xs') + '</td>' +
        '<td>' + aIn('cables', c.id, 'calibre', c.calibre, '', 'w-s') + '</td>' +
        '<td>' + aIn('cables', c.id, 'hilos', c.hilos, '', 'w-xs') + '</td>' +
        '<td>' + aIn('cables', c.id, 'aislamiento', c.aislamiento, '', 'w-s') + '</td>' +
        '<td>' + aIn('cables', c.id, 'articulo', c.articulo, '', 'w-s') + '</td>' +
        '<td>' + aSel('cables', c.id, 'clase', c.clase, clases, 'w-s') + '</td><td>' + aIn('cables', c.id, 'peso', c.peso, 'num', 'w-s') + '</td>' +
        '<td>' + aIn('cables', c.id, 'diam', c.diam, 'num', 'w-xs') + '</td><td class="n muted">' + fmt(c.diam / 25.4, 3) + '</td><td class="n muted">' + fmt(Math.PI * Math.pow(c.diam / 2, 2), 1) + '</td><td>' + aDel('cables', c.id) + '</td></tr>');
    });
    h.push('</tbody></table></div><div class="legend">Clase NEC: «MC &lt; 4/0» entra en la suma de áreas; «MC &gt;= 4/0» en la suma de diámetros (Sd); «CONTROL/SEÑAL» queda fuera del chequeo de área NEC (solo peso y ocupación bruta). Material, # de conductores, calibre (ej. «12 AWG», «4/0 AWG», «500 kcmil») e hilos («1h» sólido, «19h» cableado) definen cómo se elige el cable en los niveles.</div></div></div>');
    return h.join('');
  }
  function adminFabricantes() {
    var cat = S.catalogo;
    var h = ['<div class="card"><div class="card-h"><h2>Fabricantes de cable</h2><span class="grow"></span><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="fabricantesCable">＋ Agregar fabricante</button></div><div class="card-b flush"><table class="tbl"><thead><tr><th>Nombre</th><th class="n">Cables</th><th></th></tr></thead><tbody>'];
    cat.fabricantesCable.forEach(function (f) {
      var n = cat.cables.filter(function (c) { return c.fabricante === f.id; }).length;
      h.push('<tr><td>' + aIn('fabricantesCable', f.id, 'nombre', f.nombre, '', 'w-l') + '</td><td class="n">' + n + '</td><td>' + aDel('fabricantesCable', f.id) + '</td></tr>');
    });
    h.push('</tbody></table></div></div>');
    return h.join('');
  }
  function adminTipos() {
    var cat = S.catalogo;
    var bases = [['ventilada', 'Escalera / ventilada (Col. 1-2, factor Sd ventilada)'], ['solido', 'Fondo sólido (Col. 3-4, factor Sd sólido)']];
    var h = ['<div class="card"><div class="card-h"><h2>Tipos de canasta</h2><span class="sub">Cada tipo usa la base NEC de escalera/ventilada o de fondo sólido.</span><span class="grow"></span><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="tiposCanasta">＋ Agregar tipo</button></div><div class="card-b flush"><table class="tbl"><thead><tr><th>Nombre</th><th>Base de cálculo NEC</th><th></th></tr></thead><tbody>'];
    cat.tiposCanasta.forEach(function (t) {
      h.push('<tr><td>' + aIn('tiposCanasta', t.id, 'nombre', t.nombre, '', 'w-l') + '</td><td>' + aSel('tiposCanasta', t.id, 'baseNec', t.baseNec, bases, 'w-l') + '</td><td>' + aDel('tiposCanasta', t.id) + '</td></tr>');
    });
    h.push('</tbody></table></div></div>');
    h.push('<div class="card"><div class="card-h"><h2>Reservas de diseño disponibles</h2></div><div class="card-b"><div class="field" style="max-width:420px"><label>Valores (fracción, separados por coma)</label>' +
      '<input data-a="reservas||lista" data-type="listanum" value="' + esc(cat.reservas.join(', ')) + '"><div class="hint">Ej.: 1, 0.9, 0.8, 0.7 — 1 = sin reserva.</div></div></div></div>');
    return h.join('');
  }
  function adminNec() {
    var cat = S.catalogo;
    var h = ['<div class="card"><div class="card-h"><h2>Tabla NEC 392.22(A)</h2><span class="sub">Verifique contra la edición del código que rige el proyecto.</span><span class="grow"></span><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="nec">＋ Agregar fila</button></div><div class="card-b flush"><table class="tbl"><thead><tr><th class="n">Ancho (mm)</th><th class="n">Ancho (in)</th><th class="n">Col. 1 — escalera / ventilada (mm²)</th><th class="n">Col. 3 — fondo sólido (mm²)</th><th></th></tr></thead><tbody>'];
    cat.nec.forEach(function (r, i) {
      h.push('<tr><td>' + aIn('nec', i, 'anchoMm', r.anchoMm, 'num', 'w-s') + '</td><td>' + aIn('nec', i, 'anchoIn', r.anchoIn, 'num', 'w-s') + '</td><td>' + aIn('nec', i, 'col1', r.col1, 'num', 'w-s') + '</td><td>' + aIn('nec', i, 'col3', r.col3, 'num', 'w-s') + '</td><td>' + aDel('nec', i) + '</td></tr>');
    });
    h.push('</tbody></table><div class="legend">Columna 2 base = Columna 1 (luego − 30·Sd). Columna 4 base = Columna 3 (luego − 25·Sd).</div></div></div>');
    return h.join('');
  }
  function adminRespaldo() {
    return '<div class="card"><div class="card-h"><h2>Respaldo del catálogo</h2></div><div class="card-b"><div class="toolbar">' +
      '<button class="btn" data-act="cat-exportar">Exportar catálogo (.json)</button><button class="btn" data-act="cat-importar">Importar catálogo (.json)</button>' +
      '<button class="btn btn-danger" data-act="cat-restablecer">Restablecer catálogo base</button></div>' +
      '<p class="hint" style="color:var(--ink-3);font-size:12.5px;margin-top:12px">El catálogo base viene de Canasta_MC_V2_1.xlsx (archivo js/catalogo-base.js). Para publicar un catálogo actualizado a todo el equipo antes de la fase Supabase, exporte el .json y reemplace el contenido de ese archivo en el repositorio.</p></div></div>' +
      '<div class="card"><div class="card-h"><h2>Seguridad</h2></div><div class="card-b"><div class="toolbar"><button class="btn" data-act="admin-pin">Cambiar PIN de administrador</button><button class="btn" data-act="admin-salir">Salir del modo administrador</button></div>' +
      '<p class="hint" style="color:var(--ink-3);font-size:12.5px;margin-top:12px">En esta fase el PIN solo protege la interfaz en este navegador. En la fase Supabase se reemplaza por usuarios con rol de administrador y políticas de seguridad en la base de datos.</p></div></div>';
  }

  /* ================= Eventos ================= */
  function setPorRuta(obj, campo, valor) {
    var partes = campo.split('.');
    if (partes.length === 2) {
      obj[partes[0]] = obj[partes[0]] || [];
      obj[partes[0]][Number(partes[1])] = valor;
    } else obj[campo] = valor;
  }
  function valorDe(el) {
    var t = el.getAttribute('data-type');
    var v = el.value;
    if (t === 'num') return parseNum(v);
    if (t === 'pct') { var n = parseNum(v); return n === '' ? '' : n / 100; }
    if (t === 'lista') return v.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (t === 'listanum') return v.split(/[;,\s]+/).map(parseNum).filter(function (n) { return n !== ''; });
    return v;
  }

  vista.addEventListener('change', function (e) {
    var el = e.target, a;
    if ((a = el.getAttribute('data-bind'))) {
      var val = valorDe(el);
      if (a.indexOf('par.') === 0) {
        var k = a.slice(4);
        S.proyecto.parametros[k] = val;
        if (k === 'serie') {
          var m = serieActual();
          if ((m.acabados || []).indexOf(S.proyecto.parametros.acabado) < 0) S.proyecto.parametros.acabado = (m.acabados || [])[0] || '';
          if ((m.claros || []).indexOf(Number(S.proyecto.parametros.claro)) < 0) S.proyecto.parametros.claro = (m.claros || [])[0] || '';
        }
        if (k === 'fabricanteCable') remapearMarcaCable();
      } else S.proyecto[a] = val;
      guardar(); return renderPronto();
    }
    if ((a = el.getAttribute('data-nv'))) {
      var p = a.split('|');
      nivelPorId(p[0])[p[1]] = el.value;
      guardar(); return renderPronto();
    }
    if ((a = el.getAttribute('data-t'))) {
      var q = a.split('|'), nv = nivelPorId(q[0]);
      var tr = nv.tramos.filter(function (t) { return t.id === q[1]; })[0];
      tr[q[2]] = valorDe(el);
      if (q[2] === 'serie') {
        // Al cambiar de línea, el tamaño y el claro deben pertenecer a la nueva línea
        var sNueva = Calc.serieEfectiva(R.cx, tr, S.proyecto.parametros);
        var cNueva = R.cx.canastas[tr.canasta];
        if (cNueva && cNueva.serie !== sNueva.id) tr.canasta = '';
        if (tr.claro !== '' && (sNueva.claros || []).map(Number).indexOf(Number(tr.claro)) < 0) tr.claro = '';
      }
      guardar(); return renderPronto();
    }
    if ((a = el.getAttribute('data-l'))) {
      var r = a.split('|'), nv2 = nivelPorId(r[0]);
      var l = nv2.cables.filter(function (x) { return x.id === r[1]; })[0];
      l[r[2]] = valorDe(el);
      guardar(); return renderPronto();
    }
    if ((a = el.getAttribute('data-a'))) {
      var s = a.split('|'), col = s[0], val2 = valorDe(el);
      if (col === 'reservas') S.catalogo.reservas = val2;
      else {
        var obj = col === 'nec' ? S.catalogo.nec[Number(s[1])] : S.catalogo[col].filter(function (x) { return String(x.id) === s[1]; })[0];
        if (col === 'cables' && s[2] === 'calibre') val2 = Calc.normalizarCalibre(val2);
        if (obj) setPorRuta(obj, s[2], val2);
      }
      guardarCatalogo(); return renderPronto();
    }
    if ((a = el.getAttribute('data-filtro'))) {
      if (a === 'admin-fab') S.adminFiltro.fab = el.value;
      else if (a === 'admin-clase') S.adminFiltro.clase = el.value;
      else if (a !== 'admin-texto') S.filtroTramo[a] = el.value;
      return renderPronto();
    }
    if (el.getAttribute('data-act-change') === 'admin-filtro-serie') { S.adminFiltro.serie = el.value; return renderPronto(); }
  });

  vista.addEventListener('input', function (e) {
    if (e.target.getAttribute('data-filtro') === 'admin-texto') {
      S.adminFiltro.texto = e.target.value;
      clearTimeout(vista._tb);
      vista._tb = setTimeout(render, 250);
    }
  });

  vista.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'nuevoNivelNombre') { e.preventDefault(); accion('nivel-agregar', e.target); }
    if (e.key === 'Enter' && e.target.classList.contains('cell') && e.target.tagName === 'INPUT') e.target.blur();
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-vista],[data-act]');
    if (!el || el.disabled) return;
    if (el.closest('#menuProyecto')) return;
    var v = el.getAttribute('data-vista');
    if (v) { e.preventDefault(); S.vista = v; render(); window.scrollTo(0, 0); return; }
    e.preventDefault();
    accion(el.getAttribute('data-act'), el);
  });

  function accion(act, el) {
    var id = el.getAttribute('data-id'), nivelId = el.getAttribute('data-nivel');
    var P = S.proyecto, nv = nivelId ? nivelPorId(nivelId) : null, i;
    switch (act) {
      case 'nivel-agregar':
      case 'nivel-agregar-rapido': {
        var inp = $('#nuevoNivelNombre');
        var nombre = (inp && act === 'nivel-agregar' && inp.value.trim()) || ('Nivel ' + (P.niveles.length + 1));
        var n = nuevoNivel(nombre);
        P.niveles.push(n);
        guardar();
        if (act === 'nivel-agregar-rapido') S.vista = 'nivel:' + n.id;
        render();
        toast('Nivel «' + nombre + '» agregado');
        break;
      }
      case 'nivel-serie': {
        var pre = $('#serPrefijo').value, d = parseInt($('#serDesde').value, 10), hh = parseInt($('#serHasta').value, 10);
        if (!(d <= hh) || hh - d > 200) return toast('Rango inválido');
        for (i = d; i <= hh; i++) P.niveles.push(nuevoNivel(pre + i));
        guardar(); render(); toast((hh - d + 1) + ' niveles agregados');
        break;
      }
      case 'nivel-subir':
      case 'nivel-bajar': {
        i = P.niveles.findIndex(function (n) { return n.id === id; });
        var j = act === 'nivel-subir' ? i - 1 : i + 1;
        if (j < 0 || j >= P.niveles.length) return;
        var tmp = P.niveles[i]; P.niveles[i] = P.niveles[j]; P.niveles[j] = tmp;
        guardar(); render();
        break;
      }
      case 'nivel-duplicar': {
        var src = nivelPorId(id), copia = JSON.parse(JSON.stringify(src)), mapa = {};
        copia.id = uid('n'); copia.nombre = src.nombre + ' (copia)';
        copia.tramos.forEach(function (t) { var nid = uid('t'); mapa[t.id] = nid; t.id = nid; });
        copia.cables.forEach(function (l) { l.id = uid('l'); l.tramo = mapa[l.tramo] || ''; });
        P.niveles.splice(P.niveles.indexOf(src) + 1, 0, copia);
        guardar(); render(); toast('Nivel duplicado');
        break;
      }
      case 'nivel-eliminar': {
        var nn = nivelPorId(id);
        confirmar('Eliminar nivel', '¿Eliminar «' + esc(nn.nombre) + '» con sus ' + nn.tramos.length + ' tramos y ' + nn.cables.length + ' líneas de cable?', true).then(function (ok) {
          if (!ok) return;
          P.niveles = P.niveles.filter(function (n) { return n.id !== id; });
          guardar(); render();
        });
        break;
      }
      case 'tramo-agregar':
        nv.tramos.push(nuevoTramo()); guardar(); render();
        break;
      case 'tramo-eliminar': {
        var usados = nv.cables.filter(function (l) { return l.tramo === id; }).length;
        var hacer = function () {
          nv.tramos = nv.tramos.filter(function (t) { return t.id !== id; });
          nv.cables = nv.cables.filter(function (l) { return l.tramo !== id; });
          if (S.filtroTramo[nv.id] === id) S.filtroTramo[nv.id] = '';
          guardar(); render();
        };
        if (!usados) hacer();
        else confirmar('Eliminar tramo', 'El tramo tiene ' + usados + ' línea(s) de cable que también se eliminarán. ¿Continuar?', true).then(function (ok) { if (ok) hacer(); });
        break;
      }
      case 'tramo-usar-reco': {
        var res = R.niveles.filter(function (x) { return x.nivel.id === nv.id; })[0].tramos.filter(function (t) { return t.tramo.id === id; })[0];
        if (res && res.recomendada) { res.tramo.canasta = res.recomendada.id; guardar(); render(); }
        break;
      }
      case 'filtrar-tramo':
        S.filtroTramo[nv.id] = S.filtroTramo[nv.id] === id ? '' : id;
        render();
        break;
      case 'linea-agregar':
      case 'linea-agregar5': {
        var cnt = act === 'linea-agregar5' ? 5 : 1, ultima;
        for (i = 0; i < cnt; i++) { ultima = nuevaLinea(id || ''); nv.cables.push(ultima); }
        if (id) S.filtroTramo[nv.id] = id;
        guardar(); render();
        var sel = vista.querySelector('[data-l="' + nv.id + '|' + ultima.id + '|' + (id ? 'cable' : 'tramo') + '"]');
        if (sel) { sel.scrollIntoView({ block: 'center' }); sel.focus(); }
        break;
      }
      case 'linea-eliminar':
        nv.cables = nv.cables.filter(function (l) { return l.id !== id; });
        guardar(); render();
        break;
      case 'csv-detalle': return exportarDetalle();
      case 'csv-materiales': return exportarMateriales();
      case 'imprimir': return window.print();
      case 'xlsx': return descargarExcel();
      // ----- administración -----
      case 'admin-sub': S.adminSub = id; render(); break;
      case 'admin-add': return adminAgregar(el.getAttribute('data-col'));
      case 'admin-del': return adminEliminar(el.getAttribute('data-col'), id);
      case 'admin-ordenar': {
        var fm = S.adminFiltro.serie || (S.catalogo.series[0] || {}).id;
        S.catalogo.canastas.filter(function (c) { return c.serie === fm; })
          .sort(function (a, b) { return (a.altoNom * a.anchoNom) - (b.altoNom * b.anchoNom) || a.anchoNom - b.anchoNom; })
          .forEach(function (c, k) { c.orden = k + 1; });
        guardarCatalogo(); render(); toast('Tamaños ordenados por sección (alto × ancho)');
        break;
      }
      case 'cat-exportar':
        descargar('catalogo_canastas_mc_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S.catalogo, null, 2));
        break;
      case 'cat-importar': abrirArchivo('catalogo'); break;
      case 'cat-restablecer':
        confirmar('Restablecer catálogo', 'Se reemplazará el catálogo actual por el catálogo base del Excel. Los cambios hechos en Administración se perderán (exporte primero si los necesita).', true).then(function (ok) {
          if (!ok) return;
          Store.restablecerCatalogo().then(function (c) { S.catalogo = c; render(); toast('Catálogo restablecido'); });
        });
        break;
      case 'admin-pin': return pedirPin(true);
      case 'admin-salir': Auth.salir(); S.vista = 'proyecto'; render(); toast('Modo administrador cerrado'); break;
    }
  }

  function adminAgregar(col) {
    var cat = S.catalogo;
    if (col === 'canastas') {
      var fm = S.adminFiltro.serie || (cat.series[0] || {}).id;
      if (!fm) return toast('Primero cree una línea de producto');
      var max = Math.max.apply(null, [0].concat(cat.canastas.filter(function (c) { return c.serie === fm; }).map(function (c) { return c.orden || 0; })));
      var m = serieDe(fm);
      cat.canastas.push({ id: uid('ct'), marca: m.marca, serie: fm, nombre: 'Nuevo tamaño', anchoNom: '', altoNom: '', anchoReal: '', altoReal: '', factor: '', cargas: (m.claros || []).map(function () { return ''; }), familia: '', codigo: '', orden: max + 1 });
    } else if (col === 'marcas') {
      cat.marcas.push({ id: uid('m'), nombre: 'Nueva marca' });
    } else if (col === 'series') {
      if (!cat.marcas.length) return toast('Primero cree una marca');
      cat.series.push({ id: uid('s'), marca: cat.marcas[0].id, sistema: 'canasta', nombre: '', acabados: [''], claros: [], largoPieza: 3, nota: '' });
    } else if (col === 'cables') {
      cat.cables.unshift({ id: uid('cb'), nombre: 'Nuevo cable', fabricante: S.adminFiltro.fab || (cat.fabricantesCable[0] || {}).id || '', material: 'Cu', conductores: 3, calibre: '', hilos: '', aislamiento: '', articulo: '', peso: '', diam: '', clase: S.adminFiltro.clase || 'MC < 4/0' });
      S.adminFiltro.texto = '';
    } else if (col === 'fabricantesCable') cat.fabricantesCable.push({ id: uid('f'), nombre: 'Nuevo fabricante' });
    else if (col === 'tiposCanasta') cat.tiposCanasta.push({ id: uid('tc'), nombre: 'NUEVO TIPO', baseNec: 'ventilada' });
    else if (col === 'nec') cat.nec.push({ anchoMm: '', anchoIn: '', col1: '', col3: '' });
    guardarCatalogo(); render();
  }

  function enUso(col, id) {
    var P = S.proyecto, n = 0;
    P.niveles.forEach(function (nv) {
      if (col === 'canastas') nv.tramos.forEach(function (t) { if (t.canasta === id) n++; });
      if (col === 'cables') nv.cables.forEach(function (l) { if (l.cable === id) n++; });
      if (col === 'tiposCanasta') nv.tramos.forEach(function (t) { if (t.tipo === id) n++; });
    });
    if (col === 'tiposCanasta' && P.parametros.tipo === id) n++;
    if (col === 'series') {
      if (P.parametros.serie === id) n++;
      P.niveles.forEach(function (nv) { nv.tramos.forEach(function (t) { if (t.serie === id) n++; }); });
    }
    return n;
  }

  function adminEliminar(col, id) {
    var cat = S.catalogo;
    if (col === 'marcas' && cat.series.some(function (c) { return c.marca === id; })) return toast('La marca tiene líneas de producto: elimínelas primero');
    if (col === 'series' && cat.canastas.some(function (c) { return c.serie === id; })) return toast('La línea tiene tamaños: elimínelos primero');
    if (col === 'fabricantesCable' && cat.cables.some(function (c) { return c.fabricante === id; })) return toast('El fabricante tiene cables: elimínelos o reasígnelos primero');
    if (col === 'tiposCanasta' && cat.tiposCanasta.length <= 1) return toast('Debe existir al menos un tipo de canasta');
    var uso = col === 'nec' ? 0 : enUso(col, id);
    var msg = uso ? 'El proyecto actual lo usa en ' + uso + ' lugar(es); esos cálculos quedarán incompletos. ¿Eliminar de todas formas?' : '¿Eliminar este elemento del catálogo? Otros proyectos podrían estar usándolo.';
    confirmar('Eliminar del catálogo', msg, true).then(function (ok) {
      if (!ok) return;
      if (col === 'nec') cat.nec.splice(Number(id), 1);
      else cat[col] = cat[col].filter(function (x) { return x.id !== id; });
      guardarCatalogo(); render();
    });
  }

  /* ================= Exportaciones ================= */
  function exportarDetalle() {
    var filas = [['Nivel', '#', 'Sección', 'Tipo', 'Claro (ft)', 'Cables', 'Área cables < 4/0 (mm²)', 'Sd (mm)', 'Caso NEC', 'Canalización', 'Tamaño recomendado', 'Tamaño seleccionado', 'Referencia', 'Área permitida (mm²)', '% llenado NEC', 'Carga (lb/ft)', 'Carga máx. (lb/ft)', '% carga', '% ocupación bruta', 'Veredicto', 'Distancia (m)']];
    R.niveles.forEach(function (nv) {
      nv.tramos.forEach(function (t, i) {
        if (!t.cables && !t.tramo.nombre) return;
        filas.push([nv.nivel.nombre, i + 1, t.tramo.nombre, t.tipoNombre, t.claro, t.cables, fmt(t.areaMenor, 1), fmt(t.sd, 2), t.casoTexto, nombreSerie(t.serie), t.recomendadaTexto,
          t.seleccionada ? t.seleccionada.nombre : '', t.refSeleccionada, t.areaPermitida === 'n/a' ? 'n/a' : fmt(t.areaPermitida, 1), fmtPct(t.pctNec), fmt(t.peso, 2), fmt(t.cargaMax, 2), fmtPct(t.pctCarga), fmtPct(t.pctBruta), t.veredicto, t.tramo.distancia]);
      });
    });
    descargar('detalle_tramos_' + slug(S.proyecto.numero + '_' + S.proyecto.nombre) + '.csv', csv(filas), 'text/csv;charset=utf-8');
  }
  function exportarMateriales() {
    var filas = [['CANALIZACIONES'], ['Marca', 'Tipo', 'Tamaño', 'Número de parte', 'Tramos', 'Longitud (m)']];
    R.bomCanastas.forEach(function (b) { filas.push([b.marca ? b.marca.nombre : '', Calc.SISTEMAS[b.serie.sistema] || '', b.canasta.nombre, b.referencia, b.tramos, fmt(b.longitud, 1)]); });
    filas.push([], ['CABLES'], ['Cable', 'Clase', 'Cantidad', 'Longitud estimada (m)', 'Peso estimado (kg)']);
    R.bomCables.forEach(function (b) { filas.push([b.cable.nombre, b.cable.clase, b.cantidad, fmt(b.longitud, 1), fmt(b.peso * 0.45359237, 1)]); });
    descargar('materiales_' + slug(S.proyecto.numero + '_' + S.proyecto.nombre) + '.csv', csv(filas), 'text/csv;charset=utf-8');
  }

  function descargarExcel() {
    toast('Generando Excel…');
    ExportExcel.generar(S.proyecto, S.catalogo).then(function (buf) {
      descargar('memoria_canastas_' + slug(S.proyecto.numero + '_' + S.proyecto.nombre) + '.xlsx', buf,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Excel descargado');
    }).catch(function (err) { console.error(err); toast('No se pudo generar el Excel: ' + err.message); });
  }

  /* ================= Proyectos (menú) ================= */
  var modoArchivo = 'proyecto';
  function abrirArchivo(modo) { modoArchivo = modo; $('#fileInput').value = ''; $('#fileInput').click(); }
  $('#fileInput').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (modoArchivo === 'catalogo') {
        if (!data.canastas || !data.cables || !data.marcas) throw new Error('No es un catálogo válido');
        S.catalogo = data;
        return Store.saveCatalogo(data).then(function () { render(); toast('Catálogo importado'); });
      }
      if (!data.niveles || !data.parametros) throw new Error('No es un proyecto válido');
      if (S.indice.some(function (p) { return p.id === data.id; }) || !data.id) data.id = uid('p');
      return abrirProyecto(data, true).then(function () { toast('Proyecto importado'); });
    }).catch(function (err) { toast('Error al importar: ' + err.message); });
  });

  function abrirProyecto(p, guardarlo) {
    migrarProyecto(p);
    S.proyecto = p;
    S.filtroTramo = {};
    if (S.vista.indexOf('nivel:') === 0) S.vista = 'proyecto';
    Store.setProyectoActual(p.id);
    var paso = guardarlo ? Store.saveProyecto(p) : Promise.resolve();
    return paso.then(function () { return Store.listarProyectos(); }).then(function (idx) { S.indice = idx; renderSelector(); render(); });
  }

  $('#selProyecto').addEventListener('change', function (e) {
    Store.getProyecto(e.target.value).then(function (p) { if (p) abrirProyecto(p); });
  });
  $('#btnMenuProyecto').addEventListener('click', function (e) {
    e.stopPropagation();
    var m = $('#menuProyecto');
    m.hidden = !m.hidden;
  });
  document.addEventListener('click', function () { $('#menuProyecto').hidden = true; });
  $('#menuProyecto').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    $('#menuProyecto').hidden = true;
    var a = b.getAttribute('data-accion');
    if (a === 'nuevo') {
      dialogo({ titulo: 'Nuevo proyecto', html: '<div class="field"><label>Proyecto #</label><input name="numero"></div><div class="field" style="margin-top:10px"><label>Nombre</label><input name="nombre" required></div>', ok: 'Crear' })
        .then(function (v) { if (v) abrirProyecto(nuevoProyecto({ numero: v.numero, nombre: v.nombre || '' }), true).then(function () { S.vista = 'proyecto'; render(); }); });
    } else if (a === 'ejemplo') {
      abrirProyecto(proyectoEjemplo(), true).then(function () { S.vista = 'proyecto'; render(); toast('Proyecto de ejemplo (pestaña N01 del Excel) cargado'); });
    } else if (a === 'duplicar') {
      var c = JSON.parse(JSON.stringify(S.proyecto));
      c.id = uid('p'); c.nombre = c.nombre + ' (copia)';
      abrirProyecto(c, true).then(function () { toast('Proyecto duplicado'); });
    } else if (a === 'exportar') {
      descargar('proyecto_' + slug(S.proyecto.numero + '_' + S.proyecto.nombre) + '.json', JSON.stringify(S.proyecto, null, 2));
    } else if (a === 'importar') abrirArchivo('proyecto');
    else if (a === 'xlsx') descargarExcel();
    else if (a === 'eliminar') {
      confirmar('Eliminar proyecto', '¿Eliminar definitivamente «' + esc(S.proyecto.nombre) + '» de este navegador? Exporte un respaldo si lo necesita.', true).then(function (ok) {
        if (!ok) return;
        Store.eliminarProyecto(S.proyecto.id).then(function () { return Store.listarProyectos(); }).then(function (idx) {
          S.indice = idx;
          if (idx.length) return Store.getProyecto(idx[0].id).then(function (p) { return abrirProyecto(p); });
          return abrirProyecto(nuevoProyecto(), true);
        });
      });
    }
  });

  /* ================= Administrador ================= */
  function pedirPin(cambiar) {
    var crear = cambiar || !Auth.tienePin();
    var html = crear
      ? '<p>' + (cambiar ? 'Defina el nuevo PIN de administrador.' : 'No hay un PIN de administrador en este navegador. Defina uno para habilitar la administración de catálogos.') + '</p>' +
        '<div class="field"><label>PIN (mín. 4 caracteres)</label><input type="password" name="pin" autocomplete="new-password"></div>' +
        '<div class="field" style="margin-top:10px"><label>Confirmar PIN</label><input type="password" name="pin2" autocomplete="new-password"></div>'
      : '<div class="field"><label>PIN de administrador</label><input type="password" name="pin" autocomplete="current-password"></div>';
    dialogo({ titulo: crear ? 'PIN de administrador' : 'Ingresar como administrador', html: html, ok: crear ? 'Guardar' : 'Entrar' }).then(function (v) {
      if (!v) return;
      if (crear) {
        if ((v.pin || '').length < 4) return toast('El PIN debe tener al menos 4 caracteres');
        if (v.pin !== v.pin2) return toast('Los PIN no coinciden');
        Auth.definirPin(v.pin).then(function () { S.vista = 'admin'; render(); toast('PIN guardado · modo administrador activo'); });
      } else {
        Auth.entrar(v.pin).then(function (ok) {
          if (!ok) return toast('PIN incorrecto');
          S.vista = 'admin'; render(); toast('Modo administrador activo');
        });
      }
    });
  }
  $('#btnAdmin').addEventListener('click', function () {
    if (Auth.esAdmin()) { S.vista = 'admin'; render(); }
    else pedirPin(false);
  });

  /* ================= Inicio ================= */
  function migrarCatalogo(cat) {
    // Catálogos anteriores a las líneas de producto: cada marca pasa a ser su línea de «canasta»
    if (!cat.series) {
      cat.series = cat.marcas.map(function (m) {
        return { id: m.id + '-canasta', marca: m.id, sistema: 'canasta', nombre: '', acabados: m.acabados || [], claros: m.claros || [], largoPieza: m.largoPieza || 3, nota: m.nota || '' };
      });
      cat.canastas.forEach(function (c) {
        if (c.serie && !c.familia) c.familia = c.serie; // el antiguo campo «serie» era la familia del fabricante (CF30, CF54…)
        c.serie = c.marca + '-canasta';
      });
    }
    // Agrega lo nuevo del catálogo base (marcas, líneas y tamaños) sin tocar lo editado por el administrador
    var base = window.CATALOGO_BASE;
    if ((cat.version || 1) < (base.version || 1)) {
      ['marcas', 'series', 'canastas'].forEach(function (col) {
        var ids = {};
        cat[col].forEach(function (x) { ids[x.id] = 1; });
        base[col].forEach(function (x) { if (!ids[x.id]) cat[col].push(JSON.parse(JSON.stringify(x))); });
      });
      cat.version = base.version;
    }
    // Catálogos guardados antes de separar material / conductores / calibre: se deducen del nombre
    cat.cables.forEach(function (c) {
      if (c.material && c.calibre && c.conductores) return;
      var a = Calc.atributosCable(c);
      ['material', 'conductores', 'calibre', 'hilos', 'aislamiento', 'articulo'].forEach(function (k) {
        if (c[k] === undefined || c[k] === '' || c[k] === null) c[k] = a[k] === null ? '' : a[k];
      });
    });
    return cat;
  }
  /* La versión inicial creaba automáticamente un proyecto de ejemplo (922c · oficina Sinergia).
   * Se elimina una sola vez, y solo si el usuario no lo modificó. */
  function limpiarEjemploAntiguo(idx) {
    var K = 'cmc.limpiezaEjemplo';
    if (localStorage.getItem(K)) return idx;
    localStorage.setItem(K, '1');
    var candidatos = idx.filter(function (x) { return x.numero === '922c' && x.nombre === 'oficina Sinergia'; });
    return Promise.all(candidatos.map(function (x) {
      return Store.getProyecto(x.id).then(function (p) {
        var nv = p && p.niveles;
        var intacto = p && !p.elaboro && nv.length === 1 && nv[0].nombre === 'Nivel 1' && nv[0].cables.length === 4 &&
          nv[0].tramos.length === 3 && nv[0].tramos[0].nombre === 'Ejemplo 1 — bandeja principal' &&
          nv[0].tramos[1].nombre === 'Ejemplo 2 — mezcla con cables ≥ 4/0' && !nv[0].tramos[2].nombre;
        return intacto ? Store.eliminarProyecto(x.id) : null;
      });
    })).then(function () { return Store.listarProyectos(); });
  }

  // Enlace directo a una vista: index.html#memoria, #ayuda o #proyecto
  var vistaInicial = location.hash.slice(1);
  if (['memoria', 'ayuda', 'proyecto'].indexOf(vistaInicial) >= 0) S.vista = vistaInicial;

  Store.getCatalogo().then(function (cat) {
    S.catalogo = migrarCatalogo(cat);
    return Store.listarProyectos();
  }).then(limpiarEjemploAntiguo).then(function (idx) {
    S.indice = idx;
    if (!idx.length) return abrirProyecto(nuevoProyecto(), true);
    var actual = Store.getProyectoActual();
    var id = idx.some(function (p) { return p.id === actual; }) ? actual : idx[0].id;
    return Store.getProyecto(id).then(function (p) { return abrirProyecto(p || nuevoProyecto(), !p); });
  });
})();
