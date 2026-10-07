/* Exportación a Excel (.xlsx) con fórmulas vivas — misma lógica que calc.js y que Canasta_MC_V2_1.xlsx.
 * Hojas: AYUDA · Proyecto · Resumen · Detalle · INICIO_NIVELES · una por nivel · FIN_NIVELES · NEC 392.22
 *        y catálogos ocultos (Canastas, Cables, Listas).
 * Todas las hojas de nivel tienen la misma estructura, así los totales del Resumen usan referencias 3D
 * (INICIO_NIVELES:FIN_NIVELES) y un nivel copiado dentro de Excel también se suma.
 * Usa ExcelJS, que se carga desde cdnjs solo al exportar. */
(function (global) {
  'use strict';

  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  var C = {
    navy: 'FF14263F', navy2: 'FF1F3A5F', blanco: 'FFFFFFFF', input: 'FFE2F0D9', gris: 'FF7B8796', linea: 'FFD0D7DE',
    rojoBg: 'FFFDE8E8', rojo: 'FFC62828', naranjaBg: 'FFFFF4D6', naranja: 'FF9A6700', verdeBg: 'FFE6F4EA', verde: 'FF1A7F37'
  };
  var RESERVADAS = ['AYUDA', 'Proyecto', 'Resumen', 'Detalle', 'INICIO_NIVELES', 'FIN_NIVELES', 'NEC 392.22', 'Canastas', 'Cables', 'Listas'];

  function cargarLibreria() {
    if (global.ExcelJS) return Promise.resolve();
    return new Promise(function (ok, falla) {
      var s = document.createElement('script');
      s.src = CDN;
      s.onload = ok;
      s.onerror = function () { falla(new Error('No se pudo cargar ExcelJS (se requiere conexión a internet)')); };
      document.head.appendChild(s);
    });
  }

  /* ---------- utilidades ---------- */
  function L(n) {
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function ref(nombreHoja) { return "'" + nombreHoja.replace(/'/g, "''") + "'!"; }
  function relleno(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
  var BORDE = (function () {
    var b = { style: 'thin', color: { argb: C.linea } };
    return { top: b, left: b, bottom: b, right: b };
  })();
  var E = {
    titulo: { font: { bold: true, size: 14, color: { argb: C.navy } } },
    sub: { font: { italic: true, size: 10, color: { argb: C.gris } } },
    seccion: { font: { bold: true, size: 12, color: { argb: C.navy } } },
    hdr: { font: { bold: true, size: 9, color: { argb: C.blanco } }, fill: relleno(C.navy2), alignment: { wrapText: true, vertical: 'middle', horizontal: 'center' }, border: BORDE },
    ent: { fill: relleno(C.input), border: BORDE },
    sal: { border: BORDE },
    lbl: { font: { bold: true, size: 10 } },
    nota: { font: { size: 9, color: { argb: C.gris } }, alignment: { wrapText: true, vertical: 'top' } },
    aux: { font: { size: 9, color: { argb: C.gris } } }
  };
  function con(base, extra) {
    var o = {};
    [base, extra].forEach(function (x) { if (x) Object.keys(x).forEach(function (k) { o[k] = x[k]; }); });
    return o;
  }
  /* Escribe un valor: cadena que empieza con «=» → fórmula */
  function put(ws, celda, v, estilo) {
    var c = ws.getCell(celda);
    if (typeof v === 'string' && v.charAt(0) === '=') c.value = { formula: v.slice(1) };
    else c.value = (v === '' || v === null || v === undefined) ? null : v;
    if (estilo) Object.keys(estilo).forEach(function (k) { c[k] = estilo[k]; });
    return c;
  }
  function lista(ws, celda, formula, error) {
    ws.getCell(celda).dataValidation = {
      type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true,
      errorTitle: 'Valor no válido', error: error || 'Elija un valor de la lista.'
    };
  }
  function numVal(v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); }
  function dxf(tipo) {
    var m = { error: [C.rojoBg, C.rojo], warn: [C.naranjaBg, C.naranja], ok: [C.verdeBg, C.verde], gris: [null, 'FFB0B8C2'] }[tipo];
    var st = { font: { color: { argb: m[1] } } };
    if (m[0]) st.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: m[0] } };
    if (tipo === 'error') st.font.bold = true;
    return st;
  }
  function semaforo(ws, rango, primera) {
    ws.addConditionalFormatting({
      ref: rango,
      rules: [
        { type: 'expression', priority: 1, formulae: ['LEFT(' + primera + ',1)="❌"'], style: dxf('error') },
        { type: 'expression', priority: 2, formulae: ['LEFT(' + primera + ',1)="⚠"'], style: dxf('warn') },
        { type: 'expression', priority: 3, formulae: ['LEFT(' + primera + ',1)="✔"'], style: dxf('ok') }
      ]
    });
  }
  function nombreHojaValido(nombre, usados) {
    var base = String(nombre || 'Nivel').replace(/[\\\/\?\*\[\]:]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 28) || 'Nivel';
    var n = base, k = 2;
    var choca = function (x) {
      return usados.some(function (u) { return u.toLowerCase() === x.toLowerCase(); }) ||
        RESERVADAS.some(function (u) { return u.toLowerCase() === x.toLowerCase(); });
    };
    while (choca(n)) n = base.slice(0, 26) + ' (' + (k++) + ')';
    usados.push(n);
    return n;
  }

  /* ================= Generador ================= */
  function generar(proyecto, catalogo) {
    return cargarLibreria().then(function () { return construir(proyecto, catalogo); });
  }

  function construir(P, cat) {
    var par = P.parametros;
    var marca = cat.marcas.filter(function (m) { return m.id === par.marca; })[0] || cat.marcas[0] || { nombre: '', claros: [], acabados: [] };
    var claros = (marca.claros || []).slice();
    var nClaros = Math.max(claros.length, 1);
    var tipos = cat.tiposCanasta;
    var tipoNombre = function (id) { return ((tipos.filter(function (t) { return t.id === id; })[0]) || {}).nombre || ''; };
    var canPorId = {}, cabPorId = {};
    cat.canastas.forEach(function (c) { canPorId[c.id] = c; });
    cat.cables.forEach(function (c) { cabPorId[c.id] = c; });

    // Canastas: las de la marca (candidatas a «recomendada», en orden) + seleccionadas de otra marca
    var canastas = cat.canastas.filter(function (c) { return c.marca === marca.id; })
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
    var nCand = canastas.length;
    P.niveles.forEach(function (n) {
      n.tramos.forEach(function (t) {
        var c = canPorId[t.canasta];
        if (c && canastas.indexOf(c) < 0) canastas.push(c);
      });
    });
    var nCan = Math.max(canastas.length, 1);
    var cables = cat.cables.slice();
    var nCab = Math.max(cables.length, 1);

    // Misma estructura en todas las hojas de nivel
    var maxT = 0, maxC = 0;
    P.niveles.forEach(function (n) { maxT = Math.max(maxT, n.tramos.length); maxC = Math.max(maxC, n.cables.length); });
    var X = {};
    X.nT = Math.max(30, maxT + 10);
    X.nC = Math.max(300, maxC + 50);
    X.t0 = 19; X.tE = X.t0 + X.nT - 1;
    X.c0 = X.tE + 6; X.cE = X.c0 + X.nC - 1;
    X.sv = X.cE + 5;                 // fila de valores del resumen del nivel
    X.b0 = X.sv + 4;                 // primera fila del bloque por canasta
    X.k0 = X.b0 + nCan + 3;          // primera fila del bloque por cable
    X.matriz0 = 60;                  // columna BH: matriz de cumplimiento

    var wb = new global.ExcelJS.Workbook();
    wb.creator = 'Sinergia Ingeniería — Canastas MC';
    wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;

    var wsAyuda = wb.addWorksheet('AYUDA', { views: [{ showGridLines: false }] });
    var wsP = wb.addWorksheet('Proyecto', { views: [{ showGridLines: false }] });
    var wsR = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    var wsD = wb.addWorksheet('Detalle', { views: [{ showGridLines: false }] });
    var wsIni = wb.addWorksheet('INICIO_NIVELES', { properties: { tabColor: { argb: 'FF2E7D32' } } });
    var usados = [];
    var hojasNivel = P.niveles.map(function (n) { return { nivel: n, nombre: nombreHojaValido(n.nombre, usados) }; });
    hojasNivel.forEach(function (h) { h.ws = wb.addWorksheet(h.nombre, { views: [{ showGridLines: false }], properties: { tabColor: { argb: 'FF4CAF50' } } }); });
    var wsFin = wb.addWorksheet('FIN_NIVELES', { properties: { tabColor: { argb: 'FF2E7D32' } } });
    var wsNec = wb.addWorksheet('NEC 392.22', { views: [{ showGridLines: false }] });
    var wsCan = wb.addWorksheet('Canastas', { state: 'hidden' });
    var wsCab = wb.addWorksheet('Cables', { state: 'hidden' });
    var wsLis = wb.addWorksheet('Listas', { state: 'hidden' });

    /* ---------- Listas ---------- */
    wsLis.getColumn(2).width = 12; wsLis.getColumn(4).width = 26; wsLis.getColumn(5).width = 12;
    put(wsLis, 'B2', 'Reserva', E.lbl);
    cat.reservas.forEach(function (r, i) { put(wsLis, 'B' + (3 + i), r, { numFmt: '0%' }); });
    put(wsLis, 'D2', 'Tipo de canasta', E.lbl); put(wsLis, 'E2', 'Base NEC', E.lbl);
    tipos.forEach(function (t, i) { put(wsLis, 'D' + (3 + i), t.nombre); put(wsLis, 'E' + (3 + i), t.baseNec); });
    put(wsLis, 'G2', 'Acabado', E.lbl);
    var acabados = (marca.acabados || []).length ? marca.acabados : [''];
    acabados.forEach(function (a, i) { put(wsLis, 'G' + (3 + i), a); });
    put(wsLis, 'I2', 'Claros (ft)', E.lbl);
    claros.forEach(function (c, i) { put(wsLis, 'I' + (3 + i), c); });
    var dn = wb.definedNames;
    dn.add('Listas!$B$3:$B$' + (2 + Math.max(cat.reservas.length, 1)), 'LISTA_RESERVA');
    dn.add('Listas!$D$3:$D$' + (2 + tipos.length), 'LISTA_TIPO');
    dn.add('Listas!$D$3:$E$' + (2 + tipos.length), 'TABLA_TIPOS');
    dn.add('Listas!$G$3:$G$' + (2 + acabados.length), 'LISTA_ACABADO');
    dn.add('Listas!$I$3:$I$' + (2 + Math.max(claros.length, 1)), 'LISTA_CLAROS');

    /* ---------- Cables (catálogo) ---------- */
    put(wsCab, 'B2', 'CATÁLOGO DE CABLES MC (exportado desde la herramienta)', E.seccion);
    ['Cable', 'Peso (lb/1000 ft)', 'Diámetro (in)', 'Diámetro (mm)', 'Clase NEC', 'Fabricante'].forEach(function (h, i) { put(wsCab, L(2 + i) + '4', h, E.hdr); });
    var fabs = {};
    cat.fabricantesCable.forEach(function (f) { fabs[f.id] = f.nombre; });
    cables.forEach(function (c, i) {
      var r = 5 + i;
      put(wsCab, 'B' + r, c.nombre); put(wsCab, 'C' + r, numVal(c.peso));
      put(wsCab, 'D' + r, '=IF(E' + r + '="","",E' + r + '/25.4)', { numFmt: '0.000' });
      put(wsCab, 'E' + r, numVal(c.diam)); put(wsCab, 'F' + r, c.clase); put(wsCab, 'G' + r, fabs[c.fabricante] || '');
    });
    var cabFin = 4 + nCab;
    wsCab.getColumn(2).width = 52; [3, 4, 5].forEach(function (k) { wsCab.getColumn(k).width = 12; }); wsCab.getColumn(6).width = 16; wsCab.getColumn(7).width = 14;
    dn.add('Cables!$B$5:$F$' + cabFin, 'TABLA_CABLES');
    dn.add('Cables!$B$5:$B$' + cabFin, 'LISTA_CABLES');

    /* ---------- NEC 392.22 ---------- */
    wsNec.getColumn(2).width = 12; wsNec.getColumn(3).width = 10; [4, 5, 6, 7].forEach(function (k) { wsNec.getColumn(k).width = 18; });
    put(wsNec, 'B2', 'TABLA NEC 392.22(A) — Área de relleno permitida (cables multiconductor ≤ 2000 V)', E.titulo);
    put(wsNec, 'B3', 'Verifique contra la edición del código que rige el proyecto. Columna 2 = Columna 1 − (30·Sd). Columna 4 = Columna 3 − (25·Sd). Sd = suma de diámetros (mm) de los cables 4/0 y mayores.', E.nota);
    wsNec.mergeCells('B3:H3'); wsNec.getRow(3).height = 30;
    ['Ancho (mm)', 'Ancho (in)', 'ESCALERA / VENTILADA\nColumna 1 (mm²)', 'Columna 2 base\n(= Col.1, luego −30·Sd)', 'FONDO SÓLIDO\nColumna 3 (mm²)', 'Columna 4 base\n(= Col.3, luego −25·Sd)']
      .forEach(function (h, i) { put(wsNec, L(2 + i) + '5', h, E.hdr); });
    wsNec.getRow(5).height = 42;
    var nec = cat.nec.length ? cat.nec : [{}];
    nec.forEach(function (r, i) {
      var f = 6 + i;
      put(wsNec, 'B' + f, numVal(r.anchoMm), E.ent); put(wsNec, 'C' + f, numVal(r.anchoIn), E.ent);
      put(wsNec, 'D' + f, numVal(r.col1), con(E.ent, { numFmt: '#,##0' })); put(wsNec, 'E' + f, '=IF(D' + f + '="","",D' + f + ')', con(E.sal, { numFmt: '#,##0' }));
      put(wsNec, 'F' + f, numVal(r.col3), con(E.ent, { numFmt: '#,##0' })); put(wsNec, 'G' + f, '=IF(F' + f + '="","",F' + f + ')', con(E.sal, { numFmt: '#,##0' }));
    });
    var necFin = 5 + nec.length;
    var NEC = ref('NEC 392.22') + '$B$6:$G$' + necFin;
    var notasNec = [
      '• (A)(1) — todos los cables MENORES a 4/0: la suma de áreas no debe exceder la Columna 1 (o 3) para el ancho usado.',
      '• (A)(1)(a) — todos los cables 4/0 O MAYORES: la suma de diámetros no debe exceder el ancho de la canasta; una sola capa.',
      '• (A)(1)(b) — MEZCLA: la suma de áreas de los cables < 4/0 no debe exceder Columna 2 base − 30·Sd (sólido: Columna 4 − 25·Sd).',
      '• Solo control/señal: aplica 392.22(A)(2)/(A)(3) — no se calcula en este libro.',
      '• Verifique también la ampacidad (392.80(A)), soportes (392.30), curvas y separaciones.'
    ];
    notasNec.forEach(function (t, i) { put(wsNec, 'B' + (necFin + 2 + i), t, { font: { size: 10 } }); });

    /* ---------- Canastas (catálogo) ---------- */
    var cCarga0 = 10, cC1 = cCarga0 + nClaros, cC2 = cC1 + 1, cC3 = cC1 + 2, cC4 = cC1 + 3, cMarca = cC1 + 4, cSerie = cC1 + 5, cCod = cC1 + 6, cRef = cC1 + 7;
    put(wsCan, 'B2', 'CATÁLOGO DE CANASTAS — ' + (marca.nombre || '') + ' — en orden de recomendación (menor a mayor sección)', E.seccion);
    put(wsCan, 'B3', 'Las primeras ' + nCand + ' filas son las candidatas a «recomendada». Referencia = código base + acabado del proyecto.', E.nota);
    put(wsCan, L(cCarga0) + '4', 'Carga máx. (lb/ft) según claro (ft)', E.lbl);
    var hdrCan = ['Canasta', 'Ancho nom. (mm)', 'Alto nom. (mm)', 'Ancho real (mm)', 'Alto real (mm)', 'Alto efectivo (mm)', 'Área bruta efectiva (mm²)', 'Factor llenado fabricante'];
    hdrCan.forEach(function (h, i) { put(wsCan, L(2 + i) + '5', h, E.hdr); });
    for (var q = 0; q < nClaros; q++) put(wsCan, L(cCarga0 + q) + '5', claros[q] === undefined ? null : claros[q], E.hdr);
    [[cC1, 'NEC Col.1 escalera (mm²)'], [cC2, 'NEC Col.2 base escalera (mm²)'], [cC3, 'NEC Col.3 sólido (mm²)'], [cC4, 'NEC Col.4 base sólido (mm²)'], [cMarca, 'Marca'], [cSerie, 'Serie'], [cCod, 'Código base fabricante'], [cRef, 'Referencia completa (con acabado)']]
      .forEach(function (h) { put(wsCan, L(h[0]) + '5', h[1], E.hdr); });
    wsCan.getRow(5).height = 40;
    var marcaNombre = {};
    cat.marcas.forEach(function (m) { marcaNombre[m.id] = m.nombre; });
    canastas.forEach(function (c, i) {
      var r = 6 + i;
      put(wsCan, 'B' + r, c.nombre); put(wsCan, 'C' + r, numVal(c.anchoNom)); put(wsCan, 'D' + r, numVal(c.altoNom));
      put(wsCan, 'E' + r, numVal(c.anchoReal)); put(wsCan, 'F' + r, numVal(c.altoReal));
      put(wsCan, 'G' + r, '=MIN($F' + r + ',PRY_ALTMAX)'); put(wsCan, 'H' + r, '=$E' + r + '*$G' + r, { numFmt: '#,##0' });
      put(wsCan, 'I' + r, numVal(c.factor));
      for (var k = 0; k < nClaros; k++) put(wsCan, L(cCarga0 + k) + r, numVal((c.cargas || [])[k]));
      put(wsCan, L(cC1) + r, '=IFERROR(VLOOKUP($C' + r + ',' + NEC + ',3,FALSE),"")');
      put(wsCan, L(cC2) + r, '=IFERROR(VLOOKUP($C' + r + ',' + NEC + ',4,FALSE),"")');
      put(wsCan, L(cC3) + r, '=IFERROR(VLOOKUP($C' + r + ',' + NEC + ',5,FALSE),"")');
      put(wsCan, L(cC4) + r, '=IFERROR(VLOOKUP($C' + r + ',' + NEC + ',6,FALSE),"")');
      put(wsCan, L(cMarca) + r, marcaNombre[c.marca] || ''); put(wsCan, L(cSerie) + r, c.serie || ''); put(wsCan, L(cCod) + r, c.codigo || '');
      put(wsCan, L(cRef) + r, '=' + L(cCod) + r + '&PRY_ACABADO');
    });
    wsCan.getColumn(2).width = 22;
    var canFin = 5 + nCan;
    var rngCan = function (col) { return 'Canastas!$' + L(col) + '$6:$' + L(col) + '$' + canFin; };
    dn.add(rngCan(2), 'CAN_NOMBRE'); dn.add(rngCan(5), 'CAN_ANCHO'); dn.add(rngCan(8), 'CAN_BRUTA'); dn.add(rngCan(9), 'CAN_FACTOR');
    dn.add('Canastas!$' + L(cCarga0) + '$6:$' + L(cCarga0 + nClaros - 1) + '$' + canFin, 'CAN_CARGAS');
    dn.add('Canastas!$' + L(cCarga0) + '$5:$' + L(cCarga0 + nClaros - 1) + '$5', 'CAN_CLAROS');
    dn.add(rngCan(cC1), 'CAN_C1'); dn.add(rngCan(cC2), 'CAN_C2'); dn.add(rngCan(cC3), 'CAN_C3'); dn.add(rngCan(cC4), 'CAN_C4');
    dn.add(rngCan(cRef), 'CAN_REF'); dn.add(rngCan(cMarca), 'CAN_MARCA');

    /* ---------- Proyecto ---------- */
    [2, 3].forEach(function (k) { wsP.getColumn(k).width = 2; });
    wsP.getColumn(4).width = 46; wsP.getColumn(5).width = 2; wsP.getColumn(6).width = 26; wsP.getColumn(7).width = 90;
    put(wsP, 'D2', 'Sinergia Ingeniería', E.sub);
    put(wsP, 'D3', 'MEMORIA DE CÁLCULO — CANASTAS PORTACABLES (CABLE MC)', E.titulo);
    put(wsP, 'D4', 'ELECTRICAL CABLE TRAY FILL CALCULATIONS · NEC 2020 Art. 392.22(A)', E.sub);
    put(wsP, 'D6', 'Datos del proyecto / Project data', E.seccion);
    [['Proyecto # / Project #', P.numero], ['Nombre / Name', P.nombre], ['Ubicación / Location', P.ubicacion], ['Fecha / Date', P.fecha], ['Elaboró / Prepared by', P.elaboro]]
      .forEach(function (x, i) { put(wsP, 'D' + (8 + i), x[0], E.lbl); put(wsP, 'F' + (8 + i), x[1] || null, E.ent); });
    put(wsP, 'D14', 'Parámetros de cálculo / Design parameters', E.seccion);
    put(wsP, 'D15', 'Parámetro', E.hdr); put(wsP, 'F15', 'Valor', E.hdr); put(wsP, 'G15', 'Descripción / criterio', E.hdr);
    var params = [
      ['Reserva de diseño — % máx. del área NEC permitida a utilizar', numVal(par.reserva), '0%', 'LISTA_RESERVA',
        '=IF(F16>=1,"100 % — sin reserva: se usa el límite completo de NEC 392.22(A).","Se acepta hasta "&TEXT(F16,"0%")&" del área permitida por NEC (reserva de "&TEXT(1-F16,"0%")&" para crecimiento futuro).")', 'PRY_RESERVA'],
      ['Claro entre soportes por defecto (ft)', numVal(par.claro), '0.00', 'LISTA_CLAROS', 'Claros de la tabla de carga del fabricante: ' + claros.join(' · ') + ' ft. Cada tramo puede usar otro.', 'PRY_CLARO'],
      ['Tipo de canasta por defecto', tipoNombre(par.tipo), null, 'LISTA_TIPO', 'Escalera / ventilada usa Col. 1-2 y 30·Sd; fondo sólido usa Col. 3-4 y 25·Sd. Cada tramo puede cambiarlo.', 'PRY_TIPO'],
      ['Altura máxima de cómputo (mm)', numVal(par.altoMax), '0', null, 'NEC 392.22(A): se computa como máximo 150 mm (6 in). Solo afecta el % de ocupación bruta (referencia).', 'PRY_ALTMAX'],
      ['Factor Sd — escalera / ventilada (× Σ diámetros ≥ 4/0)', numVal(par.sdVentilada), '0', null, 'NEC 392.22(A)(1)(b): área permitida = Columna 2 base − 30·Sd.', 'PRY_SD_V'],
      ['Factor Sd — fondo sólido (× Σ diámetros ≥ 4/0)', numVal(par.sdSolido), '0', null, 'Ídem para fondo sólido: Columna 4 base − 25·Sd.', 'PRY_SD_S'],
      ['Marca de canasta / Brand', marca.nombre || '', null, null, 'Fija para este libro (catálogo oculto «Canastas»). Para otra marca, exporte de nuevo desde la herramienta.', 'PRY_MARCA'],
      ['Acabado / Finish', par.acabado || '', null, 'LISTA_ACABADO', 'Se agrega a la referencia del fabricante (ej. CF54/200EZ).', 'PRY_ACABADO']
    ];
    params.forEach(function (x, i) {
      var r = 16 + i;
      put(wsP, 'D' + r, x[0], con(E.sal, { alignment: { wrapText: true } }));
      put(wsP, 'F' + r, x[1], con(x[5] === 'PRY_MARCA' ? E.sal : E.ent, x[2] ? { numFmt: x[2] } : null));
      put(wsP, 'G' + r, x[4], con(E.sal, { alignment: { wrapText: true }, font: { size: 9 } }));
      if (x[3]) lista(wsP, 'F' + r, x[3]);
      dn.add('Proyecto!$F$' + r, x[5]);
    });
    var instr = [
      'INSTRUCCIONES',
      '1. Celdas VERDES = entrada manual. Los parámetros de esta hoja aplican a todo el edificio.',
      '2. Cada nivel tiene su pestaña, ubicada entre INICIO_NIVELES y FIN_NIVELES. Para agregar otro nivel: Ctrl + arrastrar una pestaña de nivel hasta antes de FIN_NIVELES y renombrarla; los TOTALES del Resumen y las listas de materiales la incluyen solos.',
      '3. En cada nivel: (a) nombre cada tramo; (b) en la lista de cables escriba el # de tramo, elija el cable y la cantidad; (c) revise la canasta recomendada y elija la seleccionada (columna verde).',
      '4. Criterio: NEC 2020 Art. 392.22(A), carga máxima por claro del fabricante y % de ocupación bruta (solo referencia).'
    ];
    instr.forEach(function (t, i) { put(wsP, 'D' + (26 + i), t, i ? { alignment: { wrapText: true, vertical: 'top' } } : E.lbl); if (i) wsP.mergeCells('D' + (26 + i) + ':G' + (26 + i)); });
    [28, 29].forEach(function (r) { wsP.getRow(r).height = 30; });

    /* ---------- Marcadores de niveles ---------- */
    put(wsIni, 'B2', '▶ INICIO DE NIVELES', E.titulo);
    put(wsIni, 'B4', 'Todas las pestañas de nivel deben quedar ENTRE esta pestaña y FIN_NIVELES. Los totales del Resumen las suman automáticamente.');
    put(wsIni, 'B5', 'Para agregar un nivel: mantenga presionada la tecla Ctrl y arrastre una pestaña de nivel; luego cámbiele el nombre (N02, S1, AZOTEA…).');
    put(wsIni, 'B6', 'No cambie el nombre de esta pestaña ni de FIN_NIVELES.');
    put(wsFin, 'B2', '◀ FIN DE NIVELES', E.titulo);
    put(wsFin, 'B4', 'Las pestañas ubicadas después de esta NO se incluyen en el Resumen.');

    /* ---------- Hojas de nivel ---------- */
    hojasNivel.forEach(function (h) { hojaNivel(h.ws, h.nivel, X, tipoNombre, canastas, canPorId, cabPorId, nCand, nCan, cables); });

    /* ---------- Resumen ---------- */
    var NIV = 'INICIO_NIVELES:FIN_NIVELES!';
    wsR.getColumn(2).width = 2; wsR.getColumn(3).width = 6; wsR.getColumn(4).width = 30; wsR.getColumn(5).width = 30;
    [6, 7, 8, 9, 10, 11, 12].forEach(function (k) { wsR.getColumn(k).width = 14; });
    put(wsR, 'C2', 'MEMORIA DE CÁLCULO — CANASTAS PORTACABLES (CABLE MC)', E.titulo);
    put(wsR, 'C3', 'Resumen del edificio / Building summary', E.sub);
    put(wsR, 'C5', 'DATOS DEL PROYECTO / Project data', E.seccion);
    ['Proyecto # / Project #', 'Nombre / Name', 'Ubicación / Location', 'Fecha / Date', 'Elaboró / Prepared by'].forEach(function (t, i) {
      put(wsR, 'C' + (6 + i), t, E.lbl); put(wsR, 'E' + (6 + i), '=Proyecto!F' + (8 + i) + '&""');
    });
    put(wsR, 'C12', 'CRITERIOS DE DISEÑO / Design criteria', E.seccion);
    var crit = [
      ['Área NEC 392.22(A)(1)', '="Cables < 4/0: Σ áreas ≤ Col. 1 (ventilada) / Col. 3 (sólido). Mezcla con ≥ 4/0: Σ áreas < 4/0 ≤ Col. 2 − "&PRY_SD_V&"·Sd (ventilada) / Col. 4 − "&PRY_SD_S&"·Sd (sólido). Solo ≥ 4/0: una capa, Σ diámetros ≤ ancho."'],
      ['Reserva de diseño', '=TEXT(PRY_RESERVA,"0%")&" del área permitida por NEC como máximo ("&IF(PRY_RESERVA>=1,"sin reserva","reserva de "&TEXT(1-PRY_RESERVA,"0%"))&")"'],
      ['Carga / claro', '="Carga real de los cables (lb/ft) ≤ carga máxima admisible de la canasta para el claro entre soportes del tramo (' + claros.join(' / ') + ' ft)."'],
      ['Ocupación bruta', '="Área de todos los cables ÷ (ancho interior real × min(alto, "&PRY_ALTMAX&" mm)). Referencia del fabricante; NO es el cumplimiento NEC."'],
      ['Tipo / claro por defecto', '=PRY_TIPO&" · "&TEXT(PRY_CLARO,"0.00")&" ft"'],
      ['Fabricante de canasta', '=PRY_MARCA&" — acabado "&PRY_ACABADO'],
      ['Limitaciones', 'No incluye ampacidad (NEC 392.80(A)), soportes (392.30) ni curvas. Cables de control/señal: fuera del chequeo de área NEC. Verifique la tabla 392.22(A) contra la edición vigente.']
    ];
    crit.forEach(function (x, i) {
      var r = 13 + i;
      put(wsR, 'C' + r, x[0], con(E.sal, E.lbl)); wsR.mergeCells('C' + r + ':D' + r);
      put(wsR, 'E' + r, x[1], con(E.sal, { alignment: { wrapText: true, vertical: 'top' }, font: { size: 9 } })); wsR.mergeCells('E' + r + ':L' + r);
      wsR.getRow(r).height = 26;
    });
    var r0 = 22;
    put(wsR, 'C' + r0, 'NIVELES DEL EDIFICIO / Building levels', E.seccion);
    var hdrNiv = ['#', 'Pestaña / Tab', 'Nivel / Level', 'Tramos', 'Cables', 'Errores ❌', 'Advertencias ⚠', 'Long. (m)', 'Máx % NEC', 'Máx % carga'];
    hdrNiv.forEach(function (t, i) { put(wsR, L(3 + i) + (r0 + 1), t, E.hdr); });
    var sv = X.sv;
    hojasNivel.forEach(function (h, i) {
      var r = r0 + 2 + i, s = ref(h.nombre);
      put(wsR, 'C' + r, i + 1, E.sal); put(wsR, 'D' + r, h.nombre, E.sal);
      put(wsR, 'E' + r, '=' + s + '$E$' + sv + '&""', E.sal);
      ['G', 'H', 'I', 'J', 'K'].forEach(function (c, k) { put(wsR, L(6 + k) + r, '=' + s + '$' + c + '$' + sv, con(E.sal, k === 4 ? { numFmt: '#,##0.0' } : null)); });
      put(wsR, 'K' + r, '=' + s + '$L$' + sv, con(E.sal, { numFmt: '0.0%' }));
      put(wsR, 'L' + r, '=' + s + '$M$' + sv, con(E.sal, { numFmt: '0.0%' }));
    });
    var rT = r0 + 2 + hojasNivel.length;
    put(wsR, 'C' + rT, '', E.sal); put(wsR, 'D' + rT, '', E.sal);
    put(wsR, 'E' + rT, 'TOTAL EDIFICIO', con(E.sal, E.lbl));
    ['G', 'H', 'I', 'J', 'K'].forEach(function (c, k) { put(wsR, L(6 + k) + rT, '=SUM(' + NIV + c + sv + ')', con(E.sal, con(E.lbl, k === 4 ? { numFmt: '#,##0.0' } : null))); });
    put(wsR, 'K' + rT, '=MAX(' + NIV + 'L' + sv + ')', con(E.sal, con(E.lbl, { numFmt: '0.0%' })));
    put(wsR, 'L' + rT, '=MAX(' + NIV + 'M' + sv + ')', con(E.sal, con(E.lbl, { numFmt: '0.0%' })));
    put(wsR, 'C' + (rT + 1), 'El TOTAL suma todas las pestañas entre INICIO_NIVELES y FIN_NIVELES. Si agrega un nivel en Excel, copie una fila de arriba y cambie el nombre de la pestaña en sus fórmulas para verlo por separado.', E.nota);
    wsR.mergeCells('C' + (rT + 1) + ':L' + (rT + 1)); wsR.getRow(rT + 1).height = 24;
    if (hojasNivel.length) {
      wsR.addConditionalFormatting({ ref: 'H' + (r0 + 2) + ':H' + rT, rules: [{ type: 'expression', priority: 1, formulae: ['N(H' + (r0 + 2) + ')>0'], style: dxf('error') }] });
      wsR.addConditionalFormatting({ ref: 'I' + (r0 + 2) + ':I' + rT, rules: [{ type: 'expression', priority: 2, formulae: ['N(I' + (r0 + 2) + ')>0'], style: dxf('warn') }] });
    }

    // Canastas por tamaño
    var rc = rT + 4;
    put(wsR, 'C' + rc, 'CANASTAS SELECCIONADAS — tramos por tamaño (lista de materiales)', E.seccion);
    var largo = Number(marca.largoPieza) || 3;
    [['C', 'Marca / Brand'], ['D', ''], ['E', 'Canasta / Size'], ['F', 'Número de parte / P/N'], ['G', 'Tramos'], ['H', 'Longitud (m)'], ['I', 'Piezas (' + largo + ' m)']].forEach(function (x) { put(wsR, x[0] + (rc + 1), x[1], E.hdr); });
    wsR.mergeCells('C' + (rc + 1) + ':D' + (rc + 1));
    canastas.forEach(function (c, i) {
      var r = rc + 2 + i, fila = X.b0 + i;
      put(wsR, 'C' + r, '=INDEX(CAN_MARCA,' + (i + 1) + ')', E.sal); wsR.mergeCells('C' + r + ':D' + r);
      put(wsR, 'E' + r, '=INDEX(CAN_NOMBRE,' + (i + 1) + ')', E.sal);
      put(wsR, 'F' + r, '=INDEX(CAN_REF,' + (i + 1) + ')', E.sal);
      put(wsR, 'G' + r, '=SUM(' + NIV + 'D' + fila + ')', E.sal);
      put(wsR, 'H' + r, '=SUM(' + NIV + 'E' + fila + ')', con(E.sal, { numFmt: '#,##0.0' }));
      put(wsR, 'I' + r, '=IF(N(H' + r + ')=0,"",ROUNDUP(H' + r + '/' + largo + ',0))', E.sal);
    });
    var rcFin = rc + 1 + canastas.length;
    if (canastas.length) {
      wsR.addConditionalFormatting({ ref: 'C' + (rc + 2) + ':I' + rcFin, rules: [{ type: 'expression', priority: 3, formulae: ['AND(N($G' + (rc + 2) + ')=0,N($H' + (rc + 2) + ')=0)'], style: dxf('gris') }] });
      put(wsR, 'G' + (rcFin + 1), '=SUM(G' + (rc + 2) + ':G' + rcFin + ')', con(E.sal, E.lbl));
      put(wsR, 'H' + (rcFin + 1), '=SUM(H' + (rc + 2) + ':H' + rcFin + ')', con(E.sal, con(E.lbl, { numFmt: '#,##0.0' })));
      put(wsR, 'I' + (rcFin + 1), '=SUM(I' + (rc + 2) + ':I' + rcFin + ')', con(E.sal, E.lbl));
      put(wsR, 'F' + (rcFin + 1), 'TOTAL', con(E.sal, E.lbl));
    }

    // Cables por tipo
    var rk = rcFin + 4;
    put(wsR, 'C' + rk, 'CABLES POR TIPO — longitud estimada = cantidad × distancia del tramo (sin colas ni subidas)', E.seccion);
    [['C', 'Cable'], ['D', ''], ['E', ''], ['F', 'Clase NEC'], ['G', 'Cantidad (corridas)'], ['H', 'Longitud estimada (m)'], ['I', 'Peso estimado (kg)']].forEach(function (x) { put(wsR, x[0] + (rk + 1), x[1], E.hdr); });
    wsR.mergeCells('C' + (rk + 1) + ':E' + (rk + 1));
    cables.forEach(function (c, i) {
      var r = rk + 2 + i, fila = X.k0 + i, rowCab = 5 + i;
      put(wsR, 'C' + r, '=Cables!B' + rowCab, E.sal); wsR.mergeCells('C' + r + ':E' + r);
      put(wsR, 'F' + r, '=Cables!F' + rowCab, E.sal);
      put(wsR, 'G' + r, '=SUM(' + NIV + 'D' + fila + ')', E.sal);
      put(wsR, 'H' + r, '=SUM(' + NIV + 'E' + fila + ')', con(E.sal, { numFmt: '#,##0.0' }));
      put(wsR, 'I' + r, '=IF(N(H' + r + ')=0,"",H' + r + '*3.28084*N(Cables!C' + rowCab + ')/1000*0.45359237)', con(E.sal, { numFmt: '#,##0.0' }));
    });
    if (cables.length) wsR.addConditionalFormatting({ ref: 'C' + (rk + 2) + ':I' + (rk + 1 + cables.length), rules: [{ type: 'expression', priority: 4, formulae: ['N($G' + (rk + 2) + ')=0'], style: dxf('gris') }] });

    /* ---------- Detalle ---------- */
    var anchosD = [2, 14, 5, 34, 22, 9, 13, 22, 16, 12, 10, 32, 11];
    anchosD.forEach(function (w, i) { wsD.getColumn(1 + i).width = w; });
    put(wsD, 'B2', 'MEMORIA DE CÁLCULO — DETALLE DE TRAMOS POR NIVEL', E.titulo);
    put(wsD, 'B3', '=TRIM("Proyecto: "&Proyecto!F8&" "&Proyecto!F9)', E.sub);
    put(wsD, 'B4', 'Tramos exportados desde la herramienta; las filas sin cables quedan en blanco. Los niveles agregados en Excel no aparecen aquí.', E.nota);
    ['Nivel / Level', '#', 'Sección / Section', 'Tipo / Type', 'Cables', 'Área cables (mm²)', 'Canasta seleccionada', 'Referencia / P/N', '% llenado NEC', '% carga', 'Veredicto / Verdict', 'Distancia (m)']
      .forEach(function (t, i) { put(wsD, L(2 + i) + '6', t, E.hdr); });
    wsD.getRow(6).height = 30;
    var rd = 7;
    hojasNivel.forEach(function (h) {
      var s = ref(h.nombre);
      h.nivel.tramos.forEach(function (t, i) {
        var tr = X.t0 + i, cond = 'IF(N(' + s + '$H' + tr + ')>0,';
        put(wsD, 'B' + rd, '=' + cond + s + '$F$8&"","")', E.sal);
        put(wsD, 'C' + rd, '=' + cond + (i + 1) + ',"")', E.sal);
        put(wsD, 'D' + rd, '=' + cond + 'IF(' + s + '$D' + tr + '="","(sin nombre)",' + s + '$D' + tr + '&""),"")', E.sal);
        put(wsD, 'E' + rd, '=' + cond + 'IF(' + s + '$F' + tr + '="",PRY_TIPO,' + s + '$F' + tr + '),"")', E.sal);
        put(wsD, 'F' + rd, '=' + cond + s + '$H' + tr + ',"")', E.sal);
        put(wsD, 'G' + rd, '=' + cond + s + '$AY' + tr + ',"")', con(E.sal, { numFmt: '#,##0.0' }));
        put(wsD, 'H' + rd, '=' + cond + 'IF(' + s + '$M' + tr + '="","Sin selección",' + s + '$M' + tr + '),"")', E.sal);
        put(wsD, 'I' + rd, '=' + cond + s + '$X' + tr + '&"","")', E.sal);
        put(wsD, 'J' + rd, '=' + cond + s + '$O' + tr + ',"")', con(E.sal, { numFmt: '0.0%' }));
        put(wsD, 'K' + rd, '=' + cond + s + '$R' + tr + ',"")', con(E.sal, { numFmt: '0.0%' }));
        put(wsD, 'L' + rd, '=' + cond + s + '$T' + tr + '&"","")', E.sal);
        put(wsD, 'M' + rd, '=' + cond + 'IF(N(' + s + '$V' + tr + ')>0,' + s + '$V' + tr + ',""),"")', con(E.sal, { numFmt: '#,##0.0' }));
        rd++;
      });
    });
    if (rd > 7) {
      semaforo(wsD, 'L7:L' + (rd - 1), '$L7');
      wsD.addConditionalFormatting({ ref: 'J7:J' + (rd - 1), rules: [
        { type: 'expression', priority: 10, formulae: ['AND(ISNUMBER($J7),$J7>1)'], style: dxf('error') },
        { type: 'expression', priority: 11, formulae: ['AND(ISNUMBER($J7),$J7>PRY_RESERVA)'], style: dxf('warn') }] });
    }

    /* ---------- AYUDA ---------- */
    wsAyuda.getColumn(2).width = 4; wsAyuda.getColumn(3).width = 120;
    put(wsAyuda, 'B2', 'AYUDA — Cómo usar este libro (exportado desde la herramienta web Canastas MC)', E.titulo);
    [
      ['A', 'PROYECTO — pestaña Proyecto: datos, reserva de diseño (% máx. del área NEC), claro, tipo de canasta y acabado por defecto. Aplican a todo el edificio.'],
      ['B', 'NIVELES — cada nivel tiene su pestaña entre INICIO_NIVELES y FIN_NIVELES. Para agregar uno: Ctrl + arrastrar una pestaña de nivel y renombrarla.'],
      ['C', 'TRAMOS — tabla superior de la pestaña de nivel (hasta ' + X.nT + ' tramos): nombre, tipo, claro, canasta seleccionada y distancia. Celdas VERDES = entrada manual.'],
      ['D', 'CABLES — lista inferior (hasta ' + X.nC + ' líneas): # de tramo, cable (lista desplegable del catálogo) y cantidad. Un tramo suma todas las líneas que tengan su número.'],
      ['E', 'CANASTA RECOMENDADA — la de menor sección del catálogo que cumple NEC 392.22(A) (con la reserva de diseño) y la carga máx. por claro.'],
      ['F', '% LLENADO NEC — Σ áreas de los cables < 4/0 ÷ área permitida (Col. 1/3, o Col. 2/4 − 30·Sd / 25·Sd si hay mezcla). Solo cables ≥ 4/0: Σ diámetros ÷ ancho. Verde ≤ reserva, naranja > reserva, rojo > 100 %.'],
      ['G', '% CARGA — peso real de los cables (lb/ft) ÷ carga máxima admisible de la canasta para el claro del tramo. Rojo si excede 100 %.'],
      ['H', '% OCUPACIÓN BRUTA — área de todos los cables ÷ (ancho real × min(alto, 150 mm)). Solo referencia del fabricante.'],
      ['I', 'VEREDICTO — ❌ NO CUMPLE (área NEC, ancho o peso/claro) · ⚠ advertencia (supera la reserva o la ocupación bruta) · ✔ CUMPLE.'],
      ['J', 'RESUMEN / DETALLE — consolidan niveles, errores, longitudes y la lista de materiales de canastas y cables.'],
      ['K', 'LIMITACIONES — no se verifica ampacidad (NEC 392.80(A)), soportes (392.30) ni curvas. Los cables de control/señal no entran en el chequeo de área NEC.'],
      ['L', 'DATOS — los catálogos (Canastas, Cables, Listas) están en pestañas ocultas: clic derecho en una pestaña → Mostrar. La marca de canasta queda fija; para otra marca exporte de nuevo desde la herramienta.']
    ].forEach(function (x, i) {
      var r = 4 + i * 2;
      put(wsAyuda, 'B' + r, x[0], { font: { bold: true, color: { argb: C.blanco } }, fill: relleno(C.navy2), alignment: { horizontal: 'center', vertical: 'top' } });
      put(wsAyuda, 'C' + r, x[1], { alignment: { wrapText: true, vertical: 'top' } });
    });

    wb.views = [{ activeTab: 1 }];
    return wb.xlsx.writeBuffer();
  }

  /* ================= Hoja de nivel ================= */
  function hojaNivel(ws, nivel, X, tipoNombre, canastas, canPorId, cabPorId, nCand, nCan, cables) {
    var t0 = X.t0, tE = X.tE, c0 = X.c0, cE = X.cE;
    var TD = '$D$' + c0 + ':$D$' + cE, TJ = '$J$' + c0 + ':$J$' + cE, TM = '$M$' + c0 + ':$M$' + cE,
      TN = '$N$' + c0 + ':$N$' + cE, TO = '$O$' + c0 + ':$O$' + cE, TP = '$P$' + c0 + ':$P$' + cE,
      TF = '$F$' + c0 + ':$F$' + cE;
    var anchos = { C: 5, D: 28, E: 18, F: 22, G: 9, H: 8, I: 12, J: 12, K: 20, L: 22, M: 22, N: 13, O: 11, P: 11, Q: 11, R: 11, S: 11, T: 34, U: 2, V: 10, W: 16, X: 16 };
    Object.keys(anchos).forEach(function (k) { ws.getColumn(k).width = anchos[k]; });
    ws.getColumn(1).width = 2; ws.getColumn(2).width = 2;
    var primeraAux = 48, ultimaAux = X.matriz0 + Math.max(nCand, 1) - 1; // AV … fin de matriz
    for (var k = primeraAux; k <= ultimaAux; k++) ws.getColumn(k).hidden = true;

    put(ws, 'E3', 'MEMORIA DE CÁLCULO — CANASTAS PORTACABLES (CABLE MC)', E.titulo);
    put(ws, 'E4', 'ELECTRICAL CABLE TRAY FILL CALCULATIONS · NEC 2020 Art. 392.22(A)', E.sub);
    put(ws, 'T3', 'Sinergia Ingeniería', E.sub);
    put(ws, 'D8', 'Nivel / Level', E.lbl); put(ws, 'F8', nivel.nombre || null, E.ent); ws.mergeCells('F8:I8');
    put(ws, 'D9', 'Proyecto / Project', E.lbl); put(ws, 'F9', '=TRIM(Proyecto!F8&" "&Proyecto!F9)'); ws.mergeCells('F9:L9');
    put(ws, 'D10', 'Ubicación / Location', E.lbl); put(ws, 'F10', '=Proyecto!F10&""'); ws.mergeCells('F10:L10');
    put(ws, 'D13', 'Tramos de canasta del nivel / Cable tray segments', E.seccion);
    put(ws, 'M13', 'Marca canasta / Brand:', E.lbl); put(ws, 'N13', '=PRY_MARCA&" · "&PRY_ACABADO');
    put(ws, 'D15', 'Reserva de diseño / Design margin:', E.lbl); put(ws, 'G15', '=PRY_RESERVA', { numFmt: '0%', font: { bold: true } });
    put(ws, 'I15', '(se define en la pestaña Proyecto)', { font: { size: 9, color: { argb: C.gris } } });
    put(ws, 'M15', 'Claro por defecto (ft):', E.lbl); put(ws, 'N15', '=PRY_CLARO', { numFmt: '0.00' });
    put(ws, 'O15', 'Tipo por defecto:', E.lbl); put(ws, 'Q15', '=PRY_TIPO');

    var hdr = { C: '#', D: 'Sección o tramo / Section', F: 'Tipo de canasta / Tray type', G: 'Claro (ft) / Span', H: 'Cables', I: 'Área cables < 4/0 (mm²)',
      J: 'Σ diámetros ≥ 4/0 — Sd (mm)', K: 'Caso NEC 392.22(A)', L: 'Canasta recomendada* / Recommended', M: 'Canasta seleccionada / Selected',
      N: 'Área permitida NEC (mm²)', O: '% llenado NEC', P: 'Carga cables (lb/ft)', Q: 'Carga máx. (lb/ft)', R: '% carga (peso)', S: '% ocupación bruta+',
      T: 'Veredicto / Verdict', V: 'Distancia tramo (m)', W: 'Ref. fabricante recomendada', X: 'Ref. fabricante seleccionada' };
    Object.keys(hdr).forEach(function (c) { put(ws, c + '17', hdr[c], E.hdr); });
    ws.getRow(17).height = 45;
    var aux = { AV: 'n MC<4/0', AW: 'n MC≥4/0', AX: 'n control', AY: 'Área total (mm²)', AZ: 'Caso (0-3)', BA: 'Ventilada=1', BB: 'Factor Sd', BC: 'Claro ef. (ft)', BD: 'Col. claro', BE: 'Idx canasta', BF: 'Factor fab.' };
    Object.keys(aux).forEach(function (c) { put(ws, c + '18', aux[c], E.aux); });
    put(ws, 'AV17', 'AUXILIARES (no editar) — la matriz BH… define la canasta recomendada (1 = cumple NEC + ancho + peso)', E.aux);
    for (var j = 1; j <= nCand; j++) put(ws, L(X.matriz0 + j - 1) + '18', j, E.aux);
    var mIni = L(X.matriz0), mFin = L(X.matriz0 + Math.max(nCand, 1) - 1);

    var numT = {};
    nivel.tramos.forEach(function (t, i) { numT[t.id] = i + 1; });
    var pct = con(E.sal, { numFmt: '0.0%' });

    for (var i = 0; i < X.nT; i++) {
      var r = t0 + i, t = nivel.tramos[i] || {};
      var $ = function (c) { return '$' + c + r; };
      var can = canPorId[t.canasta];
      put(ws, 'C' + r, i + 1, con(E.sal, { alignment: { horizontal: 'center' } }));
      put(ws, 'D' + r, t.nombre || null, E.ent);
      put(ws, 'E' + r, null, E.ent); ws.mergeCells('D' + r + ':E' + r);
      put(ws, 'F' + r, t.tipo ? tipoNombre(t.tipo) : null, E.ent); lista(ws, 'F' + r, 'LISTA_TIPO');
      put(ws, 'G' + r, numVal(t.claro), con(E.ent, { numFmt: '0.00' })); lista(ws, 'G' + r, 'LISTA_CLAROS');
      put(ws, 'H' + r, '=SUMIFS(' + TJ + ',' + TD + ',' + $('C') + ')', con(E.sal, { numFmt: '0;-0;;@' }));
      put(ws, 'I' + r, '=SUMIFS(' + TN + ',' + TD + ',' + $('C') + ',' + TM + ',"MC < 4/0")', con(E.sal, { numFmt: '#,##0.0;-#,##0.0;;@' }));
      put(ws, 'J' + r, '=SUMIFS(' + TO + ',' + TD + ',' + $('C') + ',' + TM + ',"MC >= 4/0")', con(E.sal, { numFmt: '#,##0.00;-#,##0.00;;@' }));
      put(ws, 'K' + r, '=IF(' + $('H') + '=0,"",CHOOSE(' + $('AZ') + '+1,"solo control/señal","(A)(1) · todos < 4/0","(A)(1)(a) · todos ≥ 4/0","(A)(1)(b) · mezcla"))', con(E.sal, { font: { size: 9 } }));
      put(ws, 'L' + r, '=IF(' + $('AZ') + '=0,"",IFERROR(INDEX(CAN_NOMBRE,MATCH(1,$' + mIni + r + ':$' + mFin + r + ',0)),"❌ ninguna cumple — divida el tramo"))', E.sal);
      put(ws, 'M' + r, can ? can.nombre : null, E.ent); lista(ws, 'M' + r, 'CAN_NOMBRE');
      put(ws, 'N' + r, '=IF(OR(' + $('BE') + '="",' + $('AZ') + '=0),"",IF(' + $('AZ') + '=2,"n/a",IFERROR(IF(' + $('AZ') + '=1,IF(' + $('BA') + '=1,INDEX(CAN_C1,' + $('BE') + '),INDEX(CAN_C3,' + $('BE') + ')),IF(' + $('BA') + '=1,INDEX(CAN_C2,' + $('BE') + '),INDEX(CAN_C4,' + $('BE') + '))-' + $('BB') + '*' + $('J') + '),"")))', con(E.sal, { numFmt: '#,##0.0' }));
      put(ws, 'O' + r, '=IF(OR(' + $('BE') + '="",' + $('AZ') + '=0),"",IF(' + $('AZ') + '=2,' + $('J') + '/INDEX(CAN_ANCHO,' + $('BE') + '),IF(' + $('N') + '="","",IF(' + $('N') + '<=0,9.99,' + $('I') + '/' + $('N') + '))))', pct);
      put(ws, 'P' + r, '=IF(' + $('H') + '=0,"",SUMIFS(' + TP + ',' + TD + ',' + $('C') + '))', con(E.sal, { numFmt: '0.00' }));
      put(ws, 'Q' + r, '=IF(OR(' + $('BE') + '="",' + $('BD') + '="",' + $('H') + '=0),"",INDEX(CAN_CARGAS,' + $('BE') + ',' + $('BD') + '))', con(E.sal, { numFmt: '0.00' }));
      put(ws, 'R' + r, '=IF(OR(' + $('P') + '="",' + $('Q') + '=""),"",IF(N(' + $('Q') + ')=0,"",' + $('P') + '/' + $('Q') + '))', pct);
      put(ws, 'S' + r, '=IF(OR(' + $('BE') + '="",' + $('H') + '=0),"",IF(N(INDEX(CAN_BRUTA,' + $('BE') + '))>0,' + $('AY') + '/INDEX(CAN_BRUTA,' + $('BE') + '),""))', pct);
      var fArea = 'AND(' + $('AZ') + '<>0,' + $('AZ') + '<>2,ISNUMBER(' + $('O') + '),N(' + $('O') + ')>1)';
      var fAncho = 'AND(OR(' + $('AZ') + '=2,' + $('AZ') + '=3),' + $('J') + '>INDEX(CAN_ANCHO,' + $('BE') + '))';
      var fPeso = 'AND(ISNUMBER(' + $('R') + '),N(' + $('R') + ')>1)';
      put(ws, 'T' + r, '=IF(' + $('H') + '=0,"",IF(' + $('BE') + '="","— seleccione canasta",IF(OR(' + fArea + ',' + fAncho + ',' + fPeso + '),"❌ NO CUMPLE —"&IF(' + fArea + '," área NEC","")&IF(' + fAncho + '," ancho","")&IF(' + fPeso + '," peso/claro",""),' +
        'IF(AND(' + $('AZ') + '<>0,' + $('AZ') + '<>2,' + $('N') + '=""),"⚠ sin dato NEC para el ancho de la canasta",IF(AND(ISNUMBER(' + $('O') + '),N(' + $('O') + ')>PRY_RESERVA),"⚠ supera la reserva de diseño",IF(AND(ISNUMBER(' + $('S') + '),ISNUMBER(' + $('BF') + '),N(' + $('S') + ')>N(' + $('BF') + ')),"⚠ ocupación bruta > fabricante","✔ CUMPLE"))))))', E.sal);
      put(ws, 'V' + r, numVal(t.distancia), con(E.ent, { numFmt: '#,##0.0' }));
      put(ws, 'W' + r, '=IF(OR(' + $('L') + '="",LEFT(' + $('L') + ',1)="❌"),"",INDEX(CAN_REF,MATCH(' + $('L') + ',CAN_NOMBRE,0)))', con(E.sal, { font: { size: 9 } }));
      put(ws, 'X' + r, '=IF(' + $('BE') + '="","",INDEX(CAN_REF,' + $('BE') + '))', con(E.sal, { font: { size: 9 } }));
      // auxiliares
      put(ws, 'AV' + r, '=SUMIFS(' + TJ + ',' + TD + ',' + $('C') + ',' + TM + ',"MC < 4/0")');
      put(ws, 'AW' + r, '=SUMIFS(' + TJ + ',' + TD + ',' + $('C') + ',' + TM + ',"MC >= 4/0")');
      put(ws, 'AX' + r, '=SUMIFS(' + TJ + ',' + TD + ',' + $('C') + ',' + TM + ',"CONTROL/SEÑAL")');
      put(ws, 'AY' + r, '=SUMIFS(' + TN + ',' + TD + ',' + $('C') + ')');
      put(ws, 'AZ' + r, '=IF(' + $('H') + '=0,0,IF(AND(' + $('AV') + '=0,' + $('AW') + '=0),0,IF(' + $('AW') + '=0,1,IF(' + $('AV') + '=0,2,3))))');
      put(ws, 'BA' + r, '=IF(IFERROR(VLOOKUP(IF(' + $('F') + '="",PRY_TIPO,' + $('F') + '),TABLA_TIPOS,2,FALSE),"ventilada")="solido",0,1)');
      put(ws, 'BB' + r, '=IF(' + $('BA') + '=1,PRY_SD_V,PRY_SD_S)');
      put(ws, 'BC' + r, '=IF(' + $('G') + '="",PRY_CLARO,' + $('G') + ')');
      put(ws, 'BD' + r, '=IFERROR(MATCH(' + $('BC') + ',CAN_CLAROS,0),"")');
      put(ws, 'BE' + r, '=IF(' + $('M') + '="","",IFERROR(MATCH(' + $('M') + ',CAN_NOMBRE,0),""))');
      put(ws, 'BF' + r, '=IF(' + $('BE') + '="","",INDEX(CAN_FACTOR,' + $('BE') + '))');
      for (var m = 0; m < nCand; m++) {
        var cm = L(X.matriz0 + m), jx = cm + '$18';
        var area = 'IF(' + $('AZ') + '=1,IF(' + $('BA') + '=1,INDEX(CAN_C1,' + jx + '),INDEX(CAN_C3,' + jx + ')),IF(' + $('BA') + '=1,INDEX(CAN_C2,' + jx + '),INDEX(CAN_C4,' + jx + '))-' + $('BB') + '*' + $('J') + ')';
        put(ws, cm + r, '=IF(' + $('AZ') + '=0,"",IF(AND(OR(' + $('AZ') + '=2,' + $('I') + '<=IFERROR(PRY_RESERVA*' + area + ',-1)),OR(' + $('AZ') + '=1,' + $('J') + '<=INDEX(CAN_ANCHO,' + jx + ')),IF(' + $('BD') + '="",TRUE,IF(INDEX(CAN_CARGAS,' + jx + ',' + $('BD') + ')="",TRUE,' + $('P') + '<=INDEX(CAN_CARGAS,' + jx + ',' + $('BD') + ')))),1,0))');
      }
    }
    var rT = 'T' + t0 + ':T' + tE;
    semaforo(ws, rT, '$T' + t0);
    ws.addConditionalFormatting({ ref: 'L' + t0 + ':L' + tE, rules: [{ type: 'expression', priority: 4, formulae: ['LEFT($L' + t0 + ',1)="❌"'], style: dxf('error') }] });
    ws.addConditionalFormatting({ ref: 'O' + t0 + ':O' + tE, rules: [
      { type: 'expression', priority: 5, formulae: ['AND(ISNUMBER($O' + t0 + '),$O' + t0 + '>1)'], style: dxf('error') },
      { type: 'expression', priority: 6, formulae: ['AND(ISNUMBER($O' + t0 + '),$O' + t0 + '>PRY_RESERVA)'], style: dxf('warn') },
      { type: 'expression', priority: 7, formulae: ['ISNUMBER($O' + t0 + ')'], style: dxf('ok') }] });
    ws.addConditionalFormatting({ ref: 'R' + t0 + ':R' + tE, rules: [
      { type: 'expression', priority: 8, formulae: ['AND(ISNUMBER($R' + t0 + '),$R' + t0 + '>1)'], style: dxf('error') }] });
    ws.addConditionalFormatting({ ref: 'S' + t0 + ':S' + tE, rules: [
      { type: 'expression', priority: 9, formulae: ['AND(ISNUMBER($S' + t0 + '),ISNUMBER($BF' + t0 + '),$S' + t0 + '>$BF' + t0 + ')'], style: dxf('warn') }] });
    put(ws, 'D' + (tE + 1), '* Recomendada: la de menor sección del catálogo que cumple NEC 392.22(A)(1) con la reserva de diseño (y Σ diámetros ≤ ancho para ≥ 4/0) y la carga máx. del fabricante para el claro. + Ocupación bruta: solo referencia.', E.nota);
    ws.mergeCells('D' + (tE + 1) + ':X' + (tE + 1)); ws.getRow(tE + 1).height = 24;

    // ---- Cables ----
    put(ws, 'D' + (c0 - 3), 'Cables por tramo / Cables', E.seccion);
    var hc = { C: '#', D: 'Tramo #', E: 'Sección (auto)', F: 'Cable (lista desplegable) / Cable', J: 'Cant. / Qty', K: 'Diám. (mm)', L: 'Área unit. (mm²)', M: 'Clase NEC', N: 'Área total (mm²)', O: 'Σ diámetros (mm)', P: 'Peso (lb/ft)', Q: 'Aviso / Check', V: 'Long. estimada (m)' };
    Object.keys(hc).forEach(function (c) { put(ws, c + (c0 - 1), hc[c], E.hdr); });
    ws.mergeCells('F' + (c0 - 1) + ':I' + (c0 - 1));
    ws.mergeCells('Q' + (c0 - 1) + ':T' + (c0 - 1));
    ws.getRow(c0 - 1).height = 30;
    ws.getRow(c0 - 1).getCell('E').alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    var TV = '$V$' + t0 + ':$V$' + tE, TDn = '$D$' + t0 + ':$D$' + tE;
    for (var n = 0; n < X.nC; n++) {
      var rr = c0 + n, l = nivel.cables[n] || {};
      var a = function (c) { return '$' + c + rr; };
      var cab = cabPorId[l.cable];
      put(ws, 'C' + rr, n + 1, con(E.sal, { font: { size: 9, color: { argb: C.gris } } }));
      put(ws, 'D' + rr, l.tramo && numT[l.tramo] ? numT[l.tramo] : null, E.ent);
      ws.getCell('D' + rr).dataValidation = { type: 'list', allowBlank: true, formulae: ['$C$' + t0 + ':$C$' + tE], showInputMessage: true, promptTitle: 'Tramo', prompt: 'Elija el # de tramo de la tabla superior; su nombre aparece en «Sección (auto)».', showErrorMessage: true, errorTitle: 'Tramo no válido', error: 'Elija un número de tramo de la lista (1 a ' + X.nT + ').' };
      put(ws, 'E' + rr, '=IF(' + a('D') + '="","",IFERROR(IF(INDEX(' + TDn + ',' + a('D') + ')="","(sin nombre)",INDEX(' + TDn + ',' + a('D') + ')&""),""))', con(E.sal, { font: { size: 8, color: { argb: C.gris } } }));
      put(ws, 'F' + rr, cab ? cab.nombre : null, E.ent); ws.mergeCells('F' + rr + ':I' + rr); lista(ws, 'F' + rr, 'LISTA_CABLES', 'Elija un cable del catálogo.');
      put(ws, 'J' + rr, numVal(l.cant), E.ent);
      put(ws, 'K' + rr, '=IF(' + a('F') + '="","",IFERROR(VLOOKUP(' + a('F') + ',TABLA_CABLES,4,FALSE),""))', con(E.sal, { numFmt: '0.00' }));
      put(ws, 'L' + rr, '=IF(' + a('K') + '="","",PI()*(' + a('K') + '/2)^2)', con(E.sal, { numFmt: '#,##0.0' }));
      put(ws, 'M' + rr, '=IF(' + a('F') + '="","",IFERROR(VLOOKUP(' + a('F') + ',TABLA_CABLES,5,FALSE),"OTRO - REVISAR"))', E.sal);
      put(ws, 'N' + rr, '=IF(OR(' + a('L') + '="",' + a('J') + '=""),"",' + a('L') + '*' + a('J') + ')', con(E.sal, { numFmt: '#,##0.0' }));
      put(ws, 'O' + rr, '=IF(OR(' + a('K') + '="",' + a('J') + '=""),"",' + a('K') + '*' + a('J') + ')', con(E.sal, { numFmt: '#,##0.00' }));
      put(ws, 'P' + rr, '=IF(OR(' + a('F') + '="",' + a('J') + '=""),"",IFERROR(VLOOKUP(' + a('F') + ',TABLA_CABLES,2,FALSE)*' + a('J') + '/1000,""))', con(E.sal, { numFmt: '0.000' }));
      put(ws, 'Q' + rr, '=IF(AND(' + a('F') + '="",' + a('D') + '="",' + a('J') + '=""),"",IF(' + a('D') + '="","❌ asigne el # de tramo",IF(NOT(ISNUMBER(' + a('D') + ')),"❌ tramo inválido",IF(OR(' + a('D') + '<1,' + a('D') + '>' + X.nT + ',' + a('D') + '<>INT(' + a('D') + ')),"❌ tramo inválido (1–' + X.nT + ')",' +
        'IF(' + a('F') + '="","❌ elija el cable",IF(ISNA(MATCH(' + a('F') + ',LISTA_CABLES,0)),"❌ cable no está en el catálogo",IF(' + a('J') + '="","⚠ falta cantidad",IF(AND(' + a('M') + '<>"MC < 4/0",' + a('M') + '<>"MC >= 4/0",' + a('M') + '<>"CONTROL/SEÑAL"),"⚠ clase no reconocida",IF(' + a('M') + '="CONTROL/SEÑAL","⚠ control/señal: fuera del chequeo de área NEC","✔")))))))))', E.sal);
      ws.mergeCells('Q' + rr + ':T' + rr);
      // Longitud estimada del cable = cantidad × distancia del tramo (columna V, como la distancia del tramo)
      var r2 = rr;
      put(ws, 'V' + r2, '=IF(OR($J' + r2 + '="",NOT(ISNUMBER($D' + r2 + '))),"",IFERROR($J' + r2 + '*N(INDEX(' + TV + ',$D' + r2 + ')),""))', con(E.sal, { numFmt: '#,##0.0' }));
    }
    semaforo(ws, 'Q' + c0 + ':Q' + cE, '$Q' + c0);

    // ---- Resumen del nivel (misma posición en todas las hojas: lo leen el Resumen y los totales 3D) ----
    var sv = X.sv;
    put(ws, 'C' + (sv - 2), 'RESUMEN DEL NIVEL — alimenta las pestañas Resumen y Detalle (no editar)', E.seccion);
    var ls = { E: 'Nivel', G: 'Tramos', H: 'Cables', I: 'Errores', J: 'Advert.', K: 'Long. (m)', L: 'Máx % NEC', M: 'Máx % carga' };
    Object.keys(ls).forEach(function (c) { put(ws, c + (sv - 1), ls[c], E.hdr); });
    var TV2 = '$V$' + t0 + ':$V$' + tE, TT = '$T$' + t0 + ':$T$' + tE, TL = '$L$' + t0 + ':$L$' + tE, TQ = '$Q$' + c0 + ':$Q$' + cE,
      TO2 = '$O$' + t0 + ':$O$' + tE, TR2 = '$R$' + t0 + ':$R$' + tE, TH = '$H$' + t0 + ':$H$' + tE;
    put(ws, 'E' + sv, '=$F$8&""', E.sal);
    put(ws, 'G' + sv, '=COUNTIF(' + TH + ',">0")', E.sal);
    put(ws, 'H' + sv, '=SUM(' + TH + ')', E.sal);
    put(ws, 'I' + sv, '=COUNTIF(' + TT + ',"❌*")+COUNTIF(' + TL + ',"❌*")+COUNTIF(' + TQ + ',"❌*")', E.sal);
    put(ws, 'J' + sv, '=COUNTIF(' + TT + ',"⚠*")+COUNTIF(' + TQ + ',"⚠*")', E.sal);
    put(ws, 'K' + sv, '=SUM(' + TV2 + ')', con(E.sal, { numFmt: '#,##0.0' }));
    put(ws, 'L' + sv, '=IF(COUNT(' + TO2 + ')=0,"",MAX(' + TO2 + '))', pct);
    put(ws, 'M' + sv, '=IF(COUNT(' + TR2 + ')=0,"",MAX(' + TR2 + '))', pct);

    var TM2 = '$M$' + t0 + ':$M$' + tE;
    put(ws, 'D' + (X.b0 - 1), 'Tramos', E.aux); put(ws, 'E' + (X.b0 - 1), 'Long. (m)', E.aux); put(ws, 'F' + (X.b0 - 1), 'Canasta (por tamaño)', E.aux);
    for (var b = 0; b < nCan; b++) {
      var rb = X.b0 + b, nomCan = 'INDEX(CAN_NOMBRE,' + (b + 1) + ')';
      put(ws, 'D' + rb, '=COUNTIF(' + TM2 + ',' + nomCan + ')', E.aux);
      put(ws, 'E' + rb, '=SUMIFS(' + TV2 + ',' + TM2 + ',' + nomCan + ')', E.aux);
      put(ws, 'F' + rb, '=' + nomCan, E.aux);
    }
    var TVc = '$V$' + c0 + ':$V$' + cE;
    put(ws, 'D' + (X.k0 - 1), 'Cantidad', E.aux); put(ws, 'E' + (X.k0 - 1), 'Long. (m)', E.aux); put(ws, 'F' + (X.k0 - 1), 'Cable', E.aux);
    for (var q = 0; q < cables.length; q++) {
      var rk = X.k0 + q;
      put(ws, 'D' + rk, '=SUMIFS(' + TJ + ',' + TF + ',Cables!$B$' + (5 + q) + ')', E.aux);
      put(ws, 'E' + rk, '=SUMIFS(' + TVc + ',' + TF + ',Cables!$B$' + (5 + q) + ')', E.aux);
      put(ws, 'F' + rk, '=Cables!$B$' + (5 + q), E.aux);
    }
  }

  global.ExportExcel = { generar: generar };
})(window);
