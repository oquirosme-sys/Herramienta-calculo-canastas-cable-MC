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
    adminFiltro: { marca: '', texto: '', fab: '', clase: '' }
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
  function marcaActual() {
    var p = S.proyecto.parametros;
    return S.catalogo.marcas.filter(function (m) { return m.id === p.marca; })[0] || S.catalogo.marcas[0] || { claros: [], acabados: [] };
  }
  function nuevoProyecto(datos) {
    var cat = S.catalogo;
    var marca = cat.marcas[0] || { id: '', claros: [], acabados: [] };
    return Object.assign({
      id: uid('p'), numero: '', nombre: '', ubicacion: '', fecha: '', elaboro: '',
      parametros: {
        reserva: 0.7, claro: marca.claros[0] || '', tipo: (cat.tiposCanasta[0] || {}).id || '', altoMax: 150,
        sdVentilada: 30, sdSolido: 25, marca: marca.id, acabado: marca.acabados[0] || '',
        fabricanteCable: (cat.fabricantesCable[0] || {}).id || ''
      },
      niveles: []
    }, datos || {});
  }
  function nuevoNivel(nombre) {
    return { id: uid('n'), nombre: nombre, tramos: [nuevoTramo(), nuevoTramo(), nuevoTramo()], cables: [] };
  }
  function nuevoTramo() { return { id: uid('t'), nombre: '', tipo: '', claro: '', canasta: '', distancia: '' }; }
  function nuevaLinea(tramoId) { return { id: uid('l'), tramo: tramoId || '', cable: '', cant: '' }; }
  function nivelPorId(id) { return S.proyecto.niveles.filter(function (n) { return n.id === id; })[0]; }

  /* ---- Selección de cable por material → # conductores → calibre → hilos, dentro de la marca del proyecto ---- */
  var CAMPOS_CABLE = ['material', 'conductores', 'calibre', 'hilos'];
  var NOMBRE_MATERIAL = { Cu: 'Cobre', Al: 'Aluminio' };
  function cablePorId(id) { return S.catalogo.cables.filter(function (c) { return c.id === id; })[0] || null; }
  function cablesDeMarca() {
    var fab = S.proyecto.parametros.fabricanteCable;
    return S.catalogo.cables.filter(function (c) { return !fab || c.fabricante === fab; });
  }
  /* Selección vigente de una línea: la de su cable, o la selección parcial guardada */
  function seleccionLinea(l) {
    var c = l.cable ? cablePorId(l.cable) : null;
    if (c) {
      var a = Calc.atributosCable(c);
      return { material: a.material, conductores: a.conductores, calibre: a.calibre, hilos: a.hilos };
    }
    return { material: l.material || '', conductores: l.conductores === '' || l.conductores === undefined ? null : l.conductores, calibre: l.calibre || '', hilos: l.hilos || '' };
  }
  /* Opciones de un campo según los campos anteriores ya elegidos */
  function opcionesCampo(campo, sel) {
    var idx = CAMPOS_CABLE.indexOf(campo), vistos = {}, out = [];
    cablesDeMarca().forEach(function (c) {
      var a = Calc.atributosCable(c);
      for (var i = 0; i < idx; i++) if (a[CAMPOS_CABLE[i]] !== sel[CAMPOS_CABLE[i]]) return;
      var v = a[campo];
      if (v === null || v === undefined || vistos[v]) return;
      vistos[v] = 1; out.push(v);
    });
    var orden = {
      material: function (x, y) { return (x === 'Cu' ? 0 : 1) - (y === 'Cu' ? 0 : 1) || String(x).localeCompare(y); },
      conductores: function (x, y) { return x - y; },
      calibre: function (x, y) { return Calc.ordenCalibre(x) - Calc.ordenCalibre(y); },
      hilos: function (x, y) { return parseInt(x || '0', 10) - parseInt(y || '0', 10); }
    };
    return out.sort(orden[campo]);
  }
  /* Busca el cable único de la marca que corresponde a la selección */
  function resolverLinea(l) {
    var lista = cablesDeMarca().filter(function (c) {
      var a = Calc.atributosCable(c);
      return a.material === l.material && a.conductores === l.conductores && a.calibre === l.calibre;
    });
    if (lista.length > 1) lista = lista.filter(function (c) { return Calc.atributosCable(c).hilos === l.hilos; });
    if (lista.length === 1) { l.cable = lista[0].id; l.hilos = Calc.atributosCable(lista[0]).hilos; }
    else l.cable = '';
  }
  function cambiarCampoCable(l, campo, valor) {
    var s = seleccionLinea(l);
    CAMPOS_CABLE.forEach(function (k) { l[k] = s[k]; });
    l[campo] = campo === 'conductores' ? (valor === '' ? null : Number(valor)) : valor;
    // Los campos siguientes se limpian si ya no aplican; con una sola opción se completan solos
    for (var i = CAMPOS_CABLE.indexOf(campo) + 1; i < CAMPOS_CABLE.length; i++) {
      var k = CAMPOS_CABLE[i], ops = opcionesCampo(k, l);
      if (ops.indexOf(l[k]) < 0) l[k] = ops.length === 1 ? ops[0] : (k === 'conductores' ? null : '');
    }
    resolverLinea(l);
  }
  /* Al cambiar la marca de cable del proyecto: cada línea pasa al cable equivalente de la nueva marca */
  function remapearMarcaCable() {
    var fab = S.proyecto.parametros.fabricanteCable, cambiadas = 0, sinEquivalente = 0;
    S.proyecto.niveles.forEach(function (nv) {
      nv.cables.forEach(function (l) {
        var c = l.cable ? cablePorId(l.cable) : null;
        if (!c || c.fabricante === fab) return;
        var s = seleccionLinea(l);
        CAMPOS_CABLE.forEach(function (k) { l[k] = s[k]; });
        resolverLinea(l);
        if (!l.cable) {
          var ops = opcionesCampo('hilos', l);
          if (ops.length) { l.hilos = ops[ops.length - 1]; resolverLinea(l); }
        }
        if (l.cable) cambiadas++; else sinEquivalente++;
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
      h.push('<button class="tab ' + (cls || '') + (S.vista === id ? ' active' : '') + '" data-vista="' + esc(id) + '" role="tab">' + (extra || '') + esc(label) + '</button>');
    };
    tab('proyecto', 'Proyecto');
    h.push('<span class="tab-sep"></span>');
    R.niveles.forEach(function (nv) {
      var r = nv.resumen;
      var dot = r.errores ? 'error' : r.advertencias ? 'warn' : r.tramos ? 'ok' : '';
      tab('nivel:' + nv.nivel.id, nv.nivel.nombre || '(sin nombre)', dot ? '<span class="dot ' + dot + '"></span>' : '');
    });
    h.push('<button class="tab tab-add" data-act="nivel-agregar-rapido" title="Agregar nivel">＋ Nivel</button>');
    h.push('<span class="tab-sep"></span>');
    tab('memoria', 'Memoria de cálculo');
    tab('ayuda', 'Ayuda');
    if (Auth.esAdmin()) tab('admin', 'Administración', '', 'tab-admin');
    $('#tabs').innerHTML = h.join('');
    var adm = Auth.esAdmin();
    $('#btnAdmin').classList.toggle('on', adm);
    $('#lblAdmin').textContent = adm ? 'Admin activo' : 'Administrador';
    $('.lock').textContent = adm ? '🔓' : '🔒';
  }

  /* ================= Vista: Proyecto ================= */
  function vistaProyecto() {
    var p = S.proyecto, par = p.parametros, cat = S.catalogo, marca = marcaActual();
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
    h.push(campo('Marca de canasta / Brand',
      '<select data-bind="par.marca">' + cat.marcas.map(function (m) { return opt(m.id, m.nombre, m.id === par.marca); }).join('') + '</select>', esc(marca.nota || '')));
    h.push(campo('Acabado / Finish',
      '<select data-bind="par.acabado">' + (marca.acabados || []).map(function (a) { return opt(a, a, a === par.acabado); }).join('') + '</select>', 'Se agrega a la referencia del fabricante (ej. CF54/200EZ).'));
    h.push(campo('Marca de cable / Cable brand',
      '<select data-bind="par.fabricanteCable">' + cat.fabricantesCable.map(function (f) { return opt(f.id, f.nombre, f.id === par.fabricanteCable); }).join('') + '</select>',
      'Una sola marca para todo el proyecto. En cada nivel el cable se elige por material, # de conductores y calibre.'));
    h.push(campo('Tipo de canasta por defecto',
      '<select data-bind="par.tipo">' + cat.tiposCanasta.map(function (t) { return opt(t.id, t.nombre, t.id === par.tipo); }).join('') + '</select>', 'Escalera / ventilada usa Col. 1-2 y 30·Sd; fondo sólido usa Col. 3-4 y 25·Sd.'));
    h.push(campo('Claro entre soportes por defecto (ft)',
      '<select data-bind="par.claro" data-type="num">' + (marca.claros || []).map(function (c) { return opt(c, fmt(c, 2) + ' ft (' + fmt(c * 0.3048, 2) + ' m)', Number(par.claro) === Number(c)); }).join('') + '</select>', 'Claros de la tabla de carga del fabricante.'));
    h.push(campo('Altura máxima de cómputo (mm)', '<input data-bind="par.altoMax" data-type="num" value="' + esc(par.altoMax) + '">', 'NEC 392.22(A): máx. 150 mm (6 in). Solo afecta la ocupación bruta.'));
    h.push(campo('Factor Sd — escalera / ventilada', '<input data-bind="par.sdVentilada" data-type="num" value="' + esc(par.sdVentilada) + '">', 'Col. 2 base − 30·Sd (Sd = Σ diámetros ≥ 4/0, mm).'));
    h.push(campo('Factor Sd — fondo sólido', '<input data-bind="par.sdSolido" data-type="num" value="' + esc(par.sdSolido) + '">', 'Col. 4 base − 25·Sd.'));
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
    var par = S.proyecto.parametros, cat = S.catalogo, marca = marcaActual();
    var tipoDef = (cat.tiposCanasta.filter(function (t) { return t.id === par.tipo; })[0] || {}).nombre || '';
    var canastasMarca = Calc.canastasDeMarca(R.cx, par.marca);
    var r = nv.resumen;
    var h = [];

    h.push('<div class="page-h"><div><h1>' + esc(nivel.nombre || '(sin nombre)') + '</h1><div class="meta">' +
      esc((S.proyecto.numero ? S.proyecto.numero + ' · ' : '') + S.proyecto.nombre) + ' · Reserva ' + fmt(par.reserva * 100, 0) + ' % · ' +
      esc(tipoDef) + ' · claro ' + fmt(par.claro, 2) + ' ft · ' + esc(marca.nombre) + ' ' + esc(par.acabado) + '</div></div>' +
      '<div class="grow"></div><div class="toolbar"><label class="sub" style="font-size:12px;color:var(--ink-3)">Nombre del nivel</label>' +
      '<input class="in" style="width:200px" data-nv="' + nivel.id + '|nombre" value="' + esc(nivel.nombre) + '"></div></div>');

    h.push('<div class="kpis">' +
      kpi('Tramos con cables', r.tramos) + kpi('Cables', r.cables) +
      kpi('Errores ❌', r.errores, r.errores ? 'error' : '') + kpi('Advertencias ⚠', r.advertencias, r.advertencias ? 'warn' : '') +
      kpi('Longitud (m)', fmt(r.longitud, 1)) + kpi('Máx % NEC', fmtPct(r.maxNec), r.maxNec > 1 ? 'error' : r.maxNec > par.reserva ? 'warn' : '') +
      kpi('Máx % carga', fmtPct(r.maxCarga), r.maxCarga > 1 ? 'error' : '') + '</div>');

    // ---- Tramos ----
    h.push('<div class="card"><div class="card-h"><h2>Tramos de canasta del nivel</h2><span class="sub">Cable tray segments</span><span class="grow"></span>' +
      '<button class="btn btn-primary btn-sm" data-act="tramo-agregar" data-nivel="' + nivel.id + '">＋ Agregar tramo</button></div>');
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead>');
    h.push('<tr><th class="grp" colspan="7">Entrada</th><th class="grp" colspan="14">Resultados</th><th class="grp"></th></tr>');
    h.push('<tr><th>#</th><th class="in-col">Sección o tramo</th><th class="in-col">Tipo de canasta</th><th class="in-col">Claro (ft)</th><th class="in-col">Dist. (m)</th>' +
      '<th class="in-col">Canasta seleccionada</th><th>Canasta recomendada*</th>' +
      '<th class="n">Cables</th><th class="n">Área cables &lt; 4/0 (mm²)</th><th class="n">Σ diám. ≥ 4/0 Sd (mm)</th><th>Caso NEC 392.22(A)</th>' +
      '<th class="n">Área permitida NEC (mm²)</th><th class="n">% llenado NEC</th><th class="n">Carga cables (lb/ft)</th><th class="n">Carga máx. (lb/ft)</th>' +
      '<th class="n">% carga</th><th class="n">% ocup. bruta+</th><th>Veredicto</th><th>Ref. fabricante seleccionada</th><th>Ref. recomendada</th><th></th><th></th></tr></thead><tbody>');
    if (!nv.tramos.length) h.push('<tr><td colspan="22" class="empty">Sin tramos. Use «Agregar tramo».</td></tr>');
    nv.tramos.forEach(function (t, i) {
      var tr = t.tramo, k = nivel.id + '|' + tr.id + '|';
      var tipoSel = '<select class="cell w-m" data-t="' + k + 'tipo">' + opt('', '(defecto) ' + tipoDef, !tr.tipo) +
        cat.tiposCanasta.map(function (x) { return opt(x.id, x.nombre, x.id === tr.tipo); }).join('') + '</select>';
      var claros = (marca.claros || []).slice();
      if (tr.claro !== '' && claros.indexOf(Number(tr.claro)) < 0) claros.push(Number(tr.claro));
      var claroSel = '<select class="cell w-s" data-t="' + k + 'claro" data-type="num">' + opt('', '(def.) ' + fmt(par.claro, 2), tr.claro === '') +
        claros.map(function (c) { return opt(c, fmt(c, 2), Number(tr.claro) === Number(c) && tr.claro !== ''); }).join('') + '</select>';
      var lista = canastasMarca.slice();
      if (t.seleccionada && lista.indexOf(t.seleccionada) < 0) lista.unshift(t.seleccionada);
      var canSel = '<select class="cell w-m" data-t="' + k + 'canasta"><option value="">— seleccione —</option>' +
        lista.map(function (c) { return opt(c.id, c.nombre + (c.marca !== par.marca ? ' (otra marca)' : ''), c.id === tr.canasta); }).join('') + '</select>';
      var reco = t.recomendada
        ? '<span class="reco">' + esc(t.recomendadaTexto) + (t.recomendada.id !== tr.canasta ? ' <button class="btn btn-sm use" data-act="tramo-usar-reco" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Usar la recomendada como seleccionada">usar</button>' : ' <span class="t-ok">✔</span>') + '</span>'
        : (t.recomendadaTexto ? '<span class="t-err">' + esc(t.recomendadaTexto) + '</span>' : '');
      var filtrado = S.filtroTramo[nivel.id] === tr.id;
      h.push('<tr' + (filtrado ? ' class="sel"' : '') + '><td><span class="num-badge">' + (i + 1) + '</span></td>' +
        '<td><input class="cell w-l" data-t="' + k + 'nombre" value="' + esc(tr.nombre) + '" placeholder="Tramo ' + (i + 1) + '"></td>' +
        '<td>' + tipoSel + '</td><td>' + claroSel + '</td>' +
        '<td><input class="cell w-xs" data-t="' + k + 'distancia" data-type="num" value="' + esc(tr.distancia) + '"></td>' +
        '<td>' + canSel + '</td><td>' + reco + '</td>' +
        '<td class="n"><a href="#" data-act="filtrar-tramo" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Ver cables de este tramo">' + t.cables + '</a></td>' +
        '<td class="n">' + (t.cables ? fmt(t.areaMenor, 1) : '') + '</td>' +
        '<td class="n">' + (t.cables ? fmt(t.sd, 2) : '') + '</td>' +
        '<td class="muted">' + esc(t.casoTexto) + '</td>' +
        '<td class="n">' + (t.areaPermitida === 'n/a' ? 'n/a' : fmt(t.areaPermitida, 1)) + '</td>' +
        '<td class="n">' + pctCell(t.pctNec, Number(par.reserva), 1) + '</td>' +
        '<td class="n">' + (t.cables ? fmt(t.peso, 2) : '') + '</td>' +
        '<td class="n">' + fmt(t.cargaMax, 2) + '</td>' +
        '<td class="n">' + pctCell(t.pctCarga, null, 1) + '</td>' +
        '<td class="n">' + pctCell(t.pctBruta, t.factorFab, null) + '</td>' +
        '<td>' + chip(t.veredicto, t.estado) + '</td>' +
        '<td class="muted">' + esc(t.refSeleccionada) + '</td>' +
        '<td class="muted">' + esc(t.refRecomendada) + '</td>' +
        '<td><button class="btn btn-sm" data-act="linea-agregar" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Agregar cable a este tramo">＋ cable</button></td>' +
        '<td><button class="btn-icon del" tabindex="-1" data-act="tramo-eliminar" data-nivel="' + nivel.id + '" data-id="' + tr.id + '" title="Eliminar tramo">✕</button></td></tr>');
    });
    h.push('</tbody></table></div>');
    h.push('<div class="legend">* Recomendada: la de menor sección del catálogo de la marca que cumple a la vez NEC 392.22(A)(1) con la reserva de diseño (y Σ diámetros ≤ ancho para cables ≥ 4/0) y la carga máxima del fabricante para el claro del tramo. ' +
      'La decisión final es la «seleccionada». + Ocupación bruta: área de todos los cables ÷ (ancho real × min(alto, ' + esc(par.altoMax) + ' mm)); solo referencia del fabricante.</div>');
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
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="in-col">Tramo</th><th class="in-col">Material</th><th class="in-col"># cond.</th><th class="in-col">Calibre</th><th class="in-col">Hilos</th><th>Cable (referencia)</th><th class="in-col n">Cant.</th>' +
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
    if (!visibles) h.push('<tr><td colspan="16" class="empty">' + (filtro ? 'Este tramo no tiene cables.' : 'Sin cables. Use «Agregar línea» o el botón «＋ cable» de un tramo.') + '</td></tr>');
    h.push('</tbody></table></div>');
    h.push('<div class="legend">Los cables 4/0 y mayores van en UNA sola capa. Los cables de control/señal no entran en el chequeo de área NEC. Verifique además la ampacidad (NEC 392.80(A)), soportes (392.30), curvas y separaciones.</div>');
    h.push('</div></div>');
    return h.join('');
  }

  /* Celdas de selección del cable: material → # conductores → calibre → hilos, y la referencia resultante */
  function celdasCable(l, k) {
    var s = seleccionLinea(l), cab = l.cable ? cablePorId(l.cable) : null;
    var otraMarca = cab && cab.fabricante !== S.proyecto.parametros.fabricanteCable;
    var sel = function (campo, cls, etiqueta) {
      var ops = opcionesCampo(campo, s), v = s[campo];
      if (v !== null && v !== '' && ops.indexOf(v) < 0) ops = [v].concat(ops);
      return '<td><select class="cell ' + cls + '" data-l="' + k + campo + '"><option value="">—</option>' +
        ops.map(function (o) { return opt(o, etiqueta(o), o === v); }).join('') + '</select></td>';
    };
    var h = sel('material', 'w-sel', function (o) { return NOMBRE_MATERIAL[o] || o; }) +
      sel('conductores', 'w-xs', function (o) { return o + 'C'; }) +
      sel('calibre', 'w-sel', function (o) { return o; });
    var opsH = s.calibre ? opcionesCampo('hilos', s) : [];
    if (opsH.length > 1) h += sel('hilos', 'w-m', Calc.textoHilos);
    else h += '<td class="muted">' + (cab || opsH.length ? esc(Calc.textoHilos(cab ? s.hilos : opsH[0])) : '') + '</td>';
    var a = cab ? Calc.atributosCable(cab) : null;
    h += '<td class="muted" title="' + esc(cab ? cab.nombre : '') + '">' +
      (cab ? esc([a.aislamiento, a.articulo].filter(Boolean).join(' · ') || cab.nombre) : '') +
      (otraMarca ? ' ' + chip('⚠ otra marca', 'warn') : '') + '</td>';
    return h;
  }

  function kpi(k, v, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + (v === '' || v === null || v === undefined ? '—' : v) + '</div></div>';
  }

  /* ================= Vista: Memoria de cálculo ================= */
  function vistaMemoria() {
    var p = S.proyecto, par = p.parametros, cat = S.catalogo, marca = marcaActual();
    var tipoDef = (cat.tiposCanasta.filter(function (t) { return t.id === par.tipo; })[0] || {}).nombre || '';
    var largo = Number(marca.largoPieza) || 3;
    var h = [];
    h.push('<div class="memoria">');
    h.push('<div class="print-h"><div><b>MEMORIA DE CÁLCULO — CANASTAS PORTACABLES (CABLE MC)</b><br>Electrical cable tray fill calculations · NEC 2020 Art. 392.22(A)</div><div style="text-align:right">Sinergia Ingeniería<br>' + esc(p.fecha || '') + '</div></div>');
    h.push('<div class="page-h"><div><h1>Memoria de cálculo</h1><div class="meta">Resumen del edificio, lista de materiales y detalle de tramos por nivel.</div></div><div class="grow"></div>' +
      '<div class="toolbar no-print"><button class="btn btn-primary" data-act="xlsx">Descargar Excel (.xlsx)</button><button class="btn" data-act="csv-detalle">Exportar detalle (CSV)</button><button class="btn" data-act="csv-materiales">Exportar materiales (CSV)</button>' +
      '<button class="btn" data-act="imprimir">Imprimir / PDF</button></div></div>');

    var t = R.total;
    h.push('<div class="kpis">' + kpi('Niveles', R.niveles.length) + kpi('Tramos con cables', t.tramos) + kpi('Cables', t.cables) +
      kpi('Errores ❌', t.errores, t.errores ? 'error' : '') + kpi('Advertencias ⚠', t.advertencias, t.advertencias ? 'warn' : '') +
      kpi('Longitud canasta (m)', fmt(t.longitud, 1)) + kpi('Máx % NEC', fmtPct(t.maxNec), t.maxNec > 1 ? 'error' : t.maxNec > par.reserva ? 'warn' : '') +
      kpi('Máx % carga', fmtPct(t.maxCarga), t.maxCarga > 1 ? 'error' : '') + '</div>');

    // Datos + criterios
    var fila = function (a, b) { return '<tr><td class="muted" style="width:230px">' + a + '</td><td style="white-space:normal">' + b + '</td></tr>'; };
    h.push('<section class="card"><div class="card-h"><h2>Datos del proyecto y criterios de diseño</h2></div><div class="card-b flush"><table class="tbl"><tbody>' +
      fila('Proyecto # / Project #', esc(p.numero)) + fila('Nombre / Name', esc(p.nombre)) + fila('Ubicación / Location', esc(p.ubicacion)) +
      fila('Fecha / Date', esc(p.fecha)) + fila('Elaboró / Prepared by', esc(p.elaboro)) +
      fila('Área NEC 392.22(A)(1)', 'Cables &lt; 4/0: Σ áreas ≤ Col. 1 (ventilada) / Col. 3 (sólido). Mezcla con ≥ 4/0: Σ áreas &lt; 4/0 ≤ Col. 2 − ' + esc(par.sdVentilada) + '·Sd (ventilada) / Col. 4 − ' + esc(par.sdSolido) + '·Sd (sólido). Solo ≥ 4/0: una capa, Σ diámetros ≤ ancho.') +
      fila('Reserva de diseño', fmt(par.reserva * 100, 0) + ' % del área permitida por NEC como máximo (' + (par.reserva >= 1 ? 'sin reserva' : 'reserva de ' + fmt((1 - par.reserva) * 100, 0) + ' %') + ')') +
      fila('Carga / claro', 'Carga real de los cables (lb/ft) ≤ carga máxima admisible de la canasta para el claro entre soportes del tramo (' + (marca.claros || []).map(function (c) { return fmt(c, 2); }).join(' / ') + ' ft).') +
      fila('Ocupación bruta', 'Área de todos los cables ÷ (ancho interior real × min(alto, ' + esc(par.altoMax) + ' mm)). Referencia del fabricante; NO es el cumplimiento NEC.') +
      fila('Tipo / claro por defecto', esc(tipoDef) + ' · ' + fmt(par.claro, 2) + ' ft') +
      fila('Fabricante de canasta', esc(marca.nombre) + ' — acabado ' + esc(par.acabado)) +
      fila('Marca de cable', esc((cat.fabricantesCable.filter(function (f) { return f.id === par.fabricanteCable; })[0] || {}).nombre || '')) +
      fila('Limitaciones', 'No incluye ampacidad (NEC 392.80(A)), soportes (392.30) ni curvas. Cables de control/señal: fuera del chequeo de área NEC. Verifique la tabla 392.22(A) contra la edición vigente.') +
      '</tbody></table></div></section>');

    // Niveles
    h.push('<section class="card"><div class="card-h"><h2>Niveles del edificio</h2><span class="sub">Building levels</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>#</th><th>Nivel / Level</th><th class="n">Tramos</th><th class="n">Cables</th><th class="n">Errores ❌</th><th class="n">Advertencias ⚠</th><th class="n">Long. (m)</th><th class="n">Máx % NEC</th><th class="n">Máx % carga</th></tr></thead><tbody>');
    R.niveles.forEach(function (nv, i) {
      var r = nv.resumen;
      h.push('<tr><td>' + (i + 1) + '</td><td><a href="#" data-vista="nivel:' + nv.nivel.id + '">' + esc(nv.nivel.nombre) + '</a></td><td class="n">' + r.tramos + '</td><td class="n">' + r.cables + '</td>' +
        '<td class="n ' + (r.errores ? 't-err' : '') + '">' + r.errores + '</td><td class="n ' + (r.advertencias ? 't-warn' : '') + '">' + r.advertencias + '</td>' +
        '<td class="n">' + fmt(r.longitud, 1) + '</td><td class="n">' + pctCell(r.maxNec, Number(par.reserva), 1) + '</td><td class="n">' + pctCell(r.maxCarga, null, 1) + '</td></tr>');
    });
    h.push('</tbody><tfoot><tr><td></td><td>TOTAL EDIFICIO</td><td class="n">' + t.tramos + '</td><td class="n">' + t.cables + '</td><td class="n">' + t.errores + '</td><td class="n">' + t.advertencias + '</td><td class="n">' + fmt(t.longitud, 1) +
      '</td><td class="n">' + fmtPct(t.maxNec) + '</td><td class="n">' + fmtPct(t.maxCarga) + '</td></tr></tfoot></table></div></div></section>');

    // Canastas
    h.push('<section class="card"><div class="card-h"><h2>Canastas seleccionadas — tramos por tamaño</h2><span class="sub">Lista de materiales de canasta</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Marca / Brand</th><th>Canasta seleccionada / Size</th><th>Número de parte / P/N</th><th class="n">Tramos</th><th class="n">Longitud (m)</th><th class="n">Piezas (' + fmt(largo, 1) + ' m)</th></tr></thead><tbody>');
    if (!R.bomCanastas.length) h.push('<tr><td colspan="6" class="empty">Sin tramos con canasta seleccionada.</td></tr>');
    var totL = 0, totP = 0;
    R.bomCanastas.forEach(function (b) {
      var l = Number(b.marca && b.marca.largoPieza) || largo;
      var piezas = Math.ceil(b.longitud / l);
      totL += b.longitud; totP += piezas;
      h.push('<tr><td>' + esc(b.marca ? b.marca.nombre : '') + '</td><td>' + esc(b.canasta.nombre) + '</td><td>' + esc(b.referencia) + '</td><td class="n">' + b.tramos + '</td><td class="n">' + fmt(b.longitud, 1) + '</td><td class="n">' + piezas + '</td></tr>');
    });
    h.push('</tbody>' + (R.bomCanastas.length ? '<tfoot><tr><td colspan="4">TOTAL</td><td class="n">' + fmt(totL, 1) + '</td><td class="n">' + totP + '</td></tr></tfoot>' : '') + '</table></div></div></section>');

    // Cables
    var fabs = {};
    cat.fabricantesCable.forEach(function (f) { fabs[f.id] = f.nombre; });
    h.push('<section class="card"><div class="card-h"><h2>Cables por tipo</h2><span class="sub">Longitud estimada = cantidad × distancia del tramo (sin colas ni subidas)</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Material</th><th class="n"># cond.</th><th>Calibre</th><th>Cable (referencia)</th><th>Fabricante</th><th>Clase NEC</th><th class="n">Cantidad (corridas)</th><th class="n">Longitud estimada (m)</th><th class="n">Peso estimado (kg)</th></tr></thead><tbody>');
    if (!R.bomCables.length) h.push('<tr><td colspan="9" class="empty">Sin cables asignados.</td></tr>');
    R.bomCables.forEach(function (b) {
      var at = Calc.atributosCable(b.cable);
      h.push('<tr><td>' + esc(NOMBRE_MATERIAL[at.material] || at.material) + '</td><td class="n">' + esc(at.conductores) + 'C</td><td>' + esc(at.calibre) + '</td><td>' + esc(b.cable.nombre) + '</td><td>' + esc(fabs[b.cable.fabricante] || '') + '</td><td class="muted">' + esc(b.cable.clase) + '</td><td class="n">' + fmt(b.cantidad, 0) + '</td><td class="n">' + fmt(b.longitud, 1) + '</td><td class="n">' + fmt(b.peso * 0.45359237, 1) + '</td></tr>');
    });
    h.push('</tbody></table></div></div></section>');

    // Detalle
    h.push('<section class="card"><div class="card-h"><h2>Detalle de tramos por nivel</h2><span class="sub">Solo tramos en uso / only segments in use</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Nivel</th><th>#</th><th>Sección</th><th>Tipo</th><th class="n">Cables</th><th class="n">Área cables (mm²)</th><th>Canasta seleccionada</th><th>Referencia / P/N</th><th class="n">% llenado NEC</th><th class="n">% carga</th><th>Veredicto</th><th class="n">Dist. (m)</th></tr></thead><tbody>');
    if (!R.detalle.length) h.push('<tr><td colspan="12" class="empty">Sin tramos en uso.</td></tr>');
    R.detalle.forEach(function (d) {
      var x = d.r;
      h.push('<tr><td>' + esc(d.nivel.nombre) + '</td><td>' + d.num + '</td><td>' + esc(x.tramo.nombre || '(sin nombre)') + '</td><td class="muted">' + esc(x.tipoNombre) + '</td>' +
        '<td class="n">' + x.cables + '</td><td class="n">' + fmt(x.areaTotal, 1) + '</td><td>' + esc(x.seleccionada ? x.seleccionada.nombre : 'Sin selección') + '</td><td>' + esc(x.refSeleccionada) + '</td>' +
        '<td class="n">' + pctCell(x.pctNec, Number(par.reserva), 1) + '</td><td class="n">' + pctCell(x.pctCarga, null, 1) + '</td><td>' + chip(x.veredicto, x.estado) + '</td><td class="n">' + fmt(x.tramo.distancia, 1) + '</td></tr>');
    });
    h.push('</tbody></table></div></div></section>');
    h.push('</div>');
    return h.join('');
  }

  /* ================= Vista: Ayuda ================= */
  function vistaAyuda() {
    var items = [
      ['A', 'PROYECTO — pestaña Proyecto: número, nombre, ubicación, reserva de diseño (% máx. del área NEC), marca y acabado de canasta, claro y tipo de canasta por defecto. Aplican a todo el edificio.'],
      ['B', 'NIVELES — en la pestaña Proyecto agregue los niveles del edificio (uno por uno o en serie). Cada nivel crea su propia pestaña. Puede renombrarlos, ordenarlos, duplicarlos o eliminarlos.'],
      ['C', 'TRAMOS — tabla superior de cada nivel: nombre del tramo, tipo de canasta, claro, distancia y canasta seleccionada. Celdas VERDES = entrada manual. Deje tipo/claro en «(defecto)» para usar los del proyecto.'],
      ['D', 'CABLES — lista inferior: tramo, cable (catálogo Viakon / Condumex) y cantidad. Un tramo suma todas las líneas asignadas. Use «＋ cable» en un tramo para agregar líneas ya asignadas, o el filtro «Mostrar» para ver un solo tramo.'],
      ['E', 'CANASTA RECOMENDADA — la de menor sección del catálogo de la marca que cumple NEC 392.22(A) (con la reserva de diseño) y la carga máx. por claro. Con «usar» la copia a la seleccionada.'],
      ['F', '% LLENADO NEC — Σ áreas de los cables < 4/0 ÷ área permitida (Col. 1/3, o Col. 2/4 − 30·Sd / 25·Sd si hay mezcla con cables ≥ 4/0). Solo cables ≥ 4/0: Σ diámetros ÷ ancho (una sola capa). Verde ≤ reserva, naranja > reserva, rojo > 100 %.'],
      ['G', '% CARGA — peso real de los cables (lb/ft) ÷ carga máxima admisible de la canasta para el claro del tramo. Rojo si excede 100 %.'],
      ['H', '% OCUPACIÓN BRUTA — área de todos los cables ÷ área interior efectiva (ancho × min(alto, 150 mm)). Solo referencia (factor del fabricante 0,5 / 0,6 / 0,7); naranja si lo supera.'],
      ['I', 'VEREDICTO — ❌ NO CUMPLE (área NEC, ancho o peso/claro) · ⚠ advertencia (supera la reserva o la ocupación bruta del fabricante) · ✔ CUMPLE.'],
      ['J', 'MEMORIA DE CÁLCULO — consolida niveles, errores, longitudes, metros por tamaño de canasta y cables por tipo (lista de materiales), y el detalle de cada tramo en uso. Se imprime o guarda en PDF desde el navegador.'],
      ['K', 'LIMITACIONES — no se verifica ampacidad (NEC 392.80(A)), soportes (392.30) ni curvas. Los cables de control/señal no entran en el chequeo de área NEC. Verifique la tabla NEC 392.22(A) contra la edición vigente.'],
      ['L', 'CATÁLOGOS — marcas, canastas, cables, fabricantes, tipos de canasta y tabla NEC se administran en la pestaña Administración (solo con permisos de administrador).'],
      ['M', 'DATOS — en esta versión los proyectos se guardan en este navegador. Use «Proyecto ▾ → Exportar» para respaldar o compartir un proyecto (.json). En la siguiente fase se conectará a la base de datos Supabase.']
    ];
    var h = ['<div class="page-h"><div><h1>Ayuda</h1><div class="meta">Cómo usar la herramienta</div></div></div>'];
    h.push('<div class="card"><div class="card-b"><div class="help-list">' + items.map(function (it) {
      return '<div class="help-item"><b class="l">' + it[0] + '</b><div>' + esc(it[1]) + '</div></div>';
    }).join('') + '</div></div></div>');
    h.push('<div class="card"><div class="card-h"><h2>Tabla NEC 392.22(A) — área de relleno permitida (multiconductor ≤ 2000 V)</h2></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th class="n">Ancho (mm)</th><th class="n">Ancho (in)</th><th class="n">Escalera / ventilada — Col. 1 (mm²)</th><th class="n">Fondo sólido — Col. 3 (mm²)</th></tr></thead><tbody>' +
      S.catalogo.nec.map(function (r) { return '<tr><td class="n">' + r.anchoMm + '</td><td class="n">' + r.anchoIn + '</td><td class="n">' + fmt(r.col1, 0) + '</td><td class="n">' + fmt(r.col3, 0) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="legend">' +
      '• (A)(1) todos &lt; 4/0: Σ áreas ≤ Columna 1. • (A)(1)(a) todos ≥ 4/0: Σ diámetros ≤ ancho, en una sola capa. • (A)(1)(b) mezcla: Σ áreas &lt; 4/0 ≤ Columna 2 base − 30·Sd (Sd = Σ diámetros ≥ 4/0, mm); fondo sólido: Columna 4 − 25·Sd. ' +
      '• Solo control/señal: aplica 392.22(A)(2)/(A)(3) — no se calcula en esta herramienta.</div></div></div>');
    return h.join('');
  }

  /* ================= Vista: Administración ================= */
  function vistaAdmin() {
    var subs = [['canastas', 'Canastas'], ['marcas', 'Marcas'], ['cables', 'Cables'], ['fabricantes', 'Fabricantes de cable'], ['tipos', 'Tipos de canasta'], ['nec', 'Tabla NEC'], ['respaldo', 'Respaldo y seguridad']];
    var h = ['<div class="page-h"><div><h1>Administración de catálogos</h1><div class="meta">Marcas, tipos de canasta y tipos de cable disponibles para todos los proyectos. Catálogo actualizado: ' + esc(S.catalogo.actualizado || '') + '</div></div></div>'];
    h.push('<div class="admin-banner">Los cambios se guardan automáticamente y afectan los cálculos de todos los proyectos de este navegador. ' +
      'Antes de eliminar un elemento verifique que ningún proyecto lo use. Use «Respaldo» para exportar el catálogo y compartirlo.</div>');
    h.push('<div class="subtabs">' + subs.map(function (s) { return '<button class="subtab' + (S.adminSub === s[0] ? ' active' : '') + '" data-act="admin-sub" data-id="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>');
    var f = { canastas: adminCanastas, marcas: adminMarcas, cables: adminCables, fabricantes: adminFabricantes, tipos: adminTipos, nec: adminNec, respaldo: adminRespaldo }[S.adminSub];
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
    var cat = S.catalogo, fm = S.adminFiltro.marca || (cat.marcas[0] || {}).id;
    var marca = cat.marcas.filter(function (m) { return m.id === fm; })[0] || { claros: [] };
    var lista = cat.canastas.filter(function (c) { return c.marca === fm; }).sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
    var necIdx = {};
    cat.nec.forEach(function (r) { necIdx[r.anchoMm] = r; });
    var h = ['<div class="card"><div class="card-h"><h2>Canastas (tipos y tamaños)</h2><span class="sub">El «orden» define cuál es la recomendada: se elige la primera que cumple. Ordene de menor a mayor sección.</span><span class="grow"></span>' +
      '<div class="toolbar"><label style="font-size:12px;color:var(--ink-3)">Marca</label><select class="in" data-act-change="admin-filtro-marca">' + cat.marcas.map(function (m) { return opt(m.id, m.nombre, m.id === fm); }).join('') + '</select>' +
      '<button class="btn btn-sm" data-act="admin-ordenar">Ordenar por sección</button><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="canastas">＋ Agregar canasta</button></div></div>'];
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="n">Orden</th><th>Nombre</th><th class="n">Ancho nom. (mm)</th><th class="n">Alto nom. (mm)</th><th class="n">Ancho real (mm)</th><th class="n">Alto real (mm)</th><th class="n">Factor llenado fab.</th>' +
      (marca.claros || []).map(function (c) { return '<th class="n">Carga máx. @ ' + fmt(c, 2) + ' ft (lb/ft)</th>'; }).join('') +
      '<th>Serie</th><th>Código base</th><th class="n">NEC Col.1 / Col.3</th><th></th></tr></thead><tbody>');
    if (!lista.length) h.push('<tr><td colspan="20" class="empty">Esta marca no tiene canastas. Agregue la primera.</td></tr>');
    lista.forEach(function (c) {
      var n = necIdx[c.anchoNom];
      h.push('<tr><td>' + aIn('canastas', c.id, 'orden', c.orden, 'num', 'w-xs') + '</td><td>' + aIn('canastas', c.id, 'nombre', c.nombre, '', 'w-m') + '</td>' +
        '<td>' + aIn('canastas', c.id, 'anchoNom', c.anchoNom, 'num', 'w-xs') + '</td><td>' + aIn('canastas', c.id, 'altoNom', c.altoNom, 'num', 'w-xs') + '</td>' +
        '<td>' + aIn('canastas', c.id, 'anchoReal', c.anchoReal, 'num', 'w-xs') + '</td><td>' + aIn('canastas', c.id, 'altoReal', c.altoReal, 'num', 'w-xs') + '</td>' +
        '<td>' + aIn('canastas', c.id, 'factor', c.factor, 'num', 'w-xs') + '</td>' +
        (marca.claros || []).map(function (_, i) { return '<td>' + aIn('canastas', c.id, 'cargas.' + i, (c.cargas || [])[i], 'num', 'w-xs') + '</td>'; }).join('') +
        '<td>' + aIn('canastas', c.id, 'serie', c.serie, '', 'w-s') + '</td><td>' + aIn('canastas', c.id, 'codigo', c.codigo, '', 'w-s') + '</td>' +
        '<td class="n ' + (n ? 'muted' : 't-err') + '">' + (n ? fmt(n.col1, 0) + ' / ' + fmt(n.col3, 0) : 'sin fila NEC') + '</td><td>' + aDel('canastas', c.id) + '</td></tr>');
    });
    h.push('</tbody></table></div><div class="legend">Referencia del fabricante = código base + acabado del proyecto. El ancho nominal debe existir en la Tabla NEC. Las cargas corresponden a los claros definidos en la marca.</div></div></div>');
    return h.join('');
  }
  function adminMarcas() {
    var cat = S.catalogo;
    var h = ['<div class="card"><div class="card-h"><h2>Marcas de canasta</h2><span class="grow"></span><button class="btn btn-primary btn-sm" data-act="admin-add" data-col="marcas">＋ Agregar marca</button></div>'];
    h.push('<div class="card-b flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Acabados (separados por coma)</th><th>Claros de la tabla de carga (ft, separados por coma)</th><th class="n">Largo de pieza (m)</th><th>Nota</th><th class="n">Canastas</th><th></th></tr></thead><tbody>');
    cat.marcas.forEach(function (m) {
      var n = cat.canastas.filter(function (c) { return c.marca === m.id; }).length;
      h.push('<tr><td>' + aIn('marcas', m.id, 'nombre', m.nombre, '', 'w-m') + '</td><td>' + aIn('marcas', m.id, 'acabados', m.acabados, 'lista', 'w-m') + '</td>' +
        '<td>' + aIn('marcas', m.id, 'claros', m.claros, 'listanum', 'w-m') + '</td><td>' + aIn('marcas', m.id, 'largoPieza', m.largoPieza || 3, 'num', 'w-xs') + '</td>' +
        '<td>' + aIn('marcas', m.id, 'nota', m.nota, '', 'w-xl') + '</td><td class="n">' + n + '</td><td>' + aDel('marcas', m.id) + '</td></tr>');
    });
    h.push('</tbody></table></div><div class="legend">Si cambia la cantidad de claros, revise las cargas de cada canasta de la marca (una columna por claro, en el mismo orden).</div></div></div>');
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
        if (k === 'marca') {
          var m = marcaActual();
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
      guardar(); return renderPronto();
    }
    if ((a = el.getAttribute('data-l'))) {
      var r = a.split('|'), nv2 = nivelPorId(r[0]);
      var l = nv2.cables.filter(function (x) { return x.id === r[1]; })[0];
      if (CAMPOS_CABLE.indexOf(r[2]) >= 0) cambiarCampoCable(l, r[2], el.value);
      else l[r[2]] = valorDe(el);
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
    if (el.getAttribute('data-act-change') === 'admin-filtro-marca') { S.adminFiltro.marca = el.value; return renderPronto(); }
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
        var fm = S.adminFiltro.marca || (S.catalogo.marcas[0] || {}).id;
        S.catalogo.canastas.filter(function (c) { return c.marca === fm; })
          .sort(function (a, b) { return (a.altoNom * a.anchoNom) - (b.altoNom * b.anchoNom) || a.anchoNom - b.anchoNom; })
          .forEach(function (c, k) { c.orden = k + 1; });
        guardarCatalogo(); render(); toast('Canastas ordenadas por sección (alto × ancho)');
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
      var fm = S.adminFiltro.marca || (cat.marcas[0] || {}).id;
      if (!fm) return toast('Primero cree una marca');
      var max = Math.max.apply(null, [0].concat(cat.canastas.filter(function (c) { return c.marca === fm; }).map(function (c) { return c.orden || 0; })));
      var m = cat.marcas.filter(function (x) { return x.id === fm; })[0];
      cat.canastas.push({ id: uid('ct'), marca: fm, nombre: 'Nueva canasta', anchoNom: '', altoNom: '', anchoReal: '', altoReal: '', factor: 0.5, cargas: (m.claros || []).map(function () { return ''; }), serie: '', codigo: '', orden: max + 1 });
    } else if (col === 'marcas') {
      var mm = { id: uid('m'), nombre: 'Nueva marca', acabados: [''], claros: [], largoPieza: 3, nota: '' };
      cat.marcas.push(mm);
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
    if (col === 'marcas' && P.parametros.marca === id) n++;
    return n;
  }

  function adminEliminar(col, id) {
    var cat = S.catalogo;
    if (col === 'marcas' && cat.canastas.some(function (c) { return c.marca === id; })) return toast('La marca tiene canastas: elimínelas primero');
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
    var filas = [['Nivel', '#', 'Sección', 'Tipo', 'Claro (ft)', 'Cables', 'Área cables < 4/0 (mm²)', 'Sd (mm)', 'Caso NEC', 'Canasta recomendada', 'Canasta seleccionada', 'Referencia', 'Área permitida (mm²)', '% llenado NEC', 'Carga (lb/ft)', 'Carga máx. (lb/ft)', '% carga', '% ocupación bruta', 'Veredicto', 'Distancia (m)']];
    R.niveles.forEach(function (nv) {
      nv.tramos.forEach(function (t, i) {
        if (!t.cables && !t.tramo.nombre) return;
        filas.push([nv.nivel.nombre, i + 1, t.tramo.nombre, t.tipoNombre, t.claro, t.cables, fmt(t.areaMenor, 1), fmt(t.sd, 2), t.casoTexto, t.recomendadaTexto,
          t.seleccionada ? t.seleccionada.nombre : '', t.refSeleccionada, t.areaPermitida === 'n/a' ? 'n/a' : fmt(t.areaPermitida, 1), fmtPct(t.pctNec), fmt(t.peso, 2), fmt(t.cargaMax, 2), fmtPct(t.pctCarga), fmtPct(t.pctBruta), t.veredicto, t.tramo.distancia]);
      });
    });
    descargar('detalle_tramos_' + slug(S.proyecto.numero + '_' + S.proyecto.nombre) + '.csv', csv(filas), 'text/csv;charset=utf-8');
  }
  function exportarMateriales() {
    var filas = [['CANASTAS'], ['Marca', 'Canasta', 'Número de parte', 'Tramos', 'Longitud (m)']];
    R.bomCanastas.forEach(function (b) { filas.push([b.marca ? b.marca.nombre : '', b.canasta.nombre, b.referencia, b.tramos, fmt(b.longitud, 1)]); });
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
    if (p.parametros && p.parametros.fabricanteCable === undefined) p.parametros.fabricanteCable = marcaCablePorUso(p);
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
    cat.marcas.forEach(function (m) { if (!m.largoPieza) m.largoPieza = 3; });
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
