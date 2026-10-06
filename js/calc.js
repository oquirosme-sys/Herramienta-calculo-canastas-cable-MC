/* Motor de cálculo — réplica de las fórmulas de las pestañas de nivel (N01) de Canasta_MC_V2_1.xlsx.
 * NEC 2020 Art. 392.22(A): área permitida / suma de diámetros, carga por claro y ocupación bruta.
 * Funciones puras: no tocan el DOM ni el almacenamiento. */
(function (global) {
  'use strict';

  var CLASE_MENOR = 'MC < 4/0';
  var CLASE_MAYOR = 'MC >= 4/0';
  var CLASE_CONTROL = 'CONTROL/SEÑAL';

  var CASOS = ['solo control/señal', '(A)(1) · todos < 4/0', '(A)(1)(a) · todos ≥ 4/0', '(A)(1)(b) · mezcla'];

  function indexar(lista) {
    var m = {};
    (lista || []).forEach(function (x) { m[x.id] = x; });
    return m;
  }

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function prepararCatalogo(cat) {
    var nec = {};
    (cat.nec || []).forEach(function (r) { nec[Number(r.anchoMm)] = r; });
    return {
      raw: cat,
      cables: indexar(cat.cables),
      canastas: indexar(cat.canastas),
      marcas: indexar(cat.marcas),
      tipos: indexar(cat.tiposCanasta),
      nec: nec
    };
  }

  function canastasDeMarca(cx, marcaId) {
    return (cx.raw.canastas || [])
      .filter(function (c) { return !marcaId || c.marca === marcaId; })
      .slice()
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  }

  /* Columnas NEC de la canasta: Col.1 / Col.3 (y Col.2 / Col.4 base = mismas, luego − k·Sd) */
  function areaBaseNec(cx, canasta, ventilada) {
    var fila = cx.nec[Number(canasta.anchoNom)];
    if (!fila) return null;
    var v = num(ventilada ? fila.col1 : fila.col3);
    return v;
  }

  /* Área permitida NEC para un caso dado (columna N del Excel) */
  function areaPermitida(cx, canasta, caso, ventilada, factorSd, sd) {
    if (caso === 2) return 'n/a';
    var base = areaBaseNec(cx, canasta, ventilada);
    if (base === null) return null;
    return caso === 1 ? base : base - factorSd * sd;
  }

  function indiceClaro(marca, claro) {
    if (!marca || claro === null) return -1;
    var cl = marca.claros || [];
    for (var i = 0; i < cl.length; i++) if (Math.abs(Number(cl[i]) - claro) < 1e-6) return i;
    return -1;
  }

  function cargaMax(canasta, idxClaro) {
    if (!canasta || idxClaro < 0) return null;
    return num((canasta.cargas || [])[idxClaro]);
  }

  /* Validación de una línea de cable (columna Q del Excel) */
  function chequearLinea(linea, tramosIds, cx) {
    var vacia = !linea.cable && !linea.tramo && num(linea.cant) === null;
    if (vacia) return { aviso: '', nivel: '' };
    if (!linea.tramo) return { aviso: '❌ asigne el tramo', nivel: 'error' };
    if (tramosIds.indexOf(linea.tramo) < 0) return { aviso: '❌ tramo inválido', nivel: 'error' };
    var cable = cx.cables[linea.cable];
    if (!linea.cable) return { aviso: '❌ elija el cable', nivel: 'error' };
    if (!cable) return { aviso: '❌ cable no está en el catálogo', nivel: 'error' };
    if (num(linea.cant) === null) return { aviso: '⚠ falta cantidad', nivel: 'warn' };
    if ([CLASE_MENOR, CLASE_MAYOR, CLASE_CONTROL].indexOf(cable.clase) < 0) return { aviso: '⚠ clase no reconocida', nivel: 'warn' };
    if (cable.clase === CLASE_CONTROL) return { aviso: '⚠ control/señal: fuera del chequeo de área NEC', nivel: 'warn' };
    return { aviso: '✔', nivel: 'ok' };
  }

  /* Datos derivados de una línea de cable (columnas K–P) */
  function datosLinea(linea, cx) {
    var cable = cx.cables[linea.cable];
    var cant = num(linea.cant);
    if (!cable) return null;
    var d = num(cable.diam);
    var areaU = d === null ? null : Math.PI * Math.pow(d / 2, 2);
    return {
      cable: cable,
      cant: cant,
      diam: d,
      areaUnit: areaU,
      clase: cable.clase,
      areaTotal: areaU !== null && cant !== null ? areaU * cant : null,
      sumaDiam: d !== null && cant !== null ? d * cant : null,
      peso: cant !== null && num(cable.peso) !== null ? num(cable.peso) * cant / 1000 : null
    };
  }

  /* Cálculo de un tramo (fila 19–48 del Excel) */
  function calcularTramo(tramo, lineas, proyecto, cx) {
    var p = proyecto.parametros;
    var r = {
      tramo: tramo, cables: 0, areaMenor: 0, sd: 0, nMenor: 0, nMayor: 0, nControl: 0,
      areaTotal: 0, peso: 0
    };
    lineas.forEach(function (l) {
      if (l.tramo !== tramo.id) return;
      var d = datosLinea(l, cx);
      var cant = num(l.cant) || 0;
      r.cables += cant;
      if (!d) return;
      if (d.clase === CLASE_MENOR) { r.nMenor += cant; r.areaMenor += d.areaTotal || 0; }
      if (d.clase === CLASE_MAYOR) { r.nMayor += cant; r.sd += d.sumaDiam || 0; }
      if (d.clase === CLASE_CONTROL) r.nControl += cant;
      r.areaTotal += d.areaTotal || 0;
      r.peso += d.peso || 0;
    });

    // Caso NEC (AZ): 0 = vacío/solo control, 1 = todos < 4/0, 2 = todos ≥ 4/0, 3 = mezcla
    r.caso = r.cables === 0 ? 0 : (r.nMenor === 0 && r.nMayor === 0 ? 0 : (r.nMayor === 0 ? 1 : (r.nMenor === 0 ? 2 : 3)));
    r.casoTexto = r.cables === 0 ? '' : CASOS[r.caso];

    var tipoId = tramo.tipo || p.tipo;
    var tipo = cx.tipos[tipoId];
    r.tipoNombre = tipo ? tipo.nombre : '';
    r.ventilada = !tipo || tipo.baseNec !== 'solido';
    r.factorSd = r.ventilada ? num(p.sdVentilada) : num(p.sdSolido);
    r.claro = num(tramo.claro) !== null ? num(tramo.claro) : num(p.claro);

    var marca = cx.marcas[p.marca];
    r.idxClaro = indiceClaro(marca, r.claro);
    var reserva = num(p.reserva);

    // Canasta recomendada: la primera (menor sección) que cumple NEC con reserva + ancho + carga por claro
    r.recomendada = null;
    if (r.caso !== 0) {
      var lista = canastasDeMarca(cx, p.marca);
      for (var i = 0; i < lista.length; i++) {
        var c = lista[i];
        var okArea = true;
        if (r.caso !== 2) {
          var ap = areaPermitida(cx, c, r.caso, r.ventilada, r.factorSd, r.sd);
          okArea = ap !== null && r.areaMenor <= reserva * ap;
        }
        var okAncho = r.caso === 1 || r.sd <= num(c.anchoReal);
        var cm = cargaMax(c, indiceClaro(cx.marcas[c.marca], r.claro));
        var okCarga = cm === null ? true : r.peso <= cm;
        if (okArea && okAncho && okCarga) { r.recomendada = c; break; }
      }
      r.recomendadaTexto = r.recomendada ? r.recomendada.nombre : '❌ ninguna cumple — divida el tramo';
    } else {
      r.recomendadaTexto = '';
    }
    r.refRecomendada = r.recomendada ? referencia(r.recomendada, p) : '';

    // Canasta seleccionada
    var sel = tramo.canasta ? cx.canastas[tramo.canasta] : null;
    r.seleccionada = sel || null;
    r.refSeleccionada = sel ? referencia(sel, p) : '';
    r.areaPermitida = null; r.pctNec = null; r.cargaMax = null; r.pctCarga = null; r.pctBruta = null;
    r.factorFab = sel ? num(sel.factor) : null;

    if (sel && r.caso !== 0) {
      r.areaPermitida = areaPermitida(cx, sel, r.caso, r.ventilada, r.factorSd, r.sd);
      if (r.caso === 2) r.pctNec = r.sd / num(sel.anchoReal);
      else if (r.areaPermitida === null) r.pctNec = null;
      else r.pctNec = r.areaPermitida <= 0 ? 9.99 : r.areaMenor / r.areaPermitida;
    }
    if (sel && r.cables > 0) {
      r.cargaMax = cargaMax(sel, indiceClaro(cx.marcas[sel.marca], r.claro));
      r.pctCarga = r.cargaMax ? r.peso / r.cargaMax : null;
      var altoEf = Math.min(num(sel.altoReal), num(p.altoMax));
      var areaBruta = num(sel.anchoReal) * altoEf;
      r.areaBruta = areaBruta;
      r.pctBruta = areaBruta > 0 ? r.areaTotal / areaBruta : null;
    }

    // Veredicto (columna T)
    r.veredicto = ''; r.estado = '';
    if (r.cables > 0) {
      if (!sel) { r.veredicto = '— seleccione canasta'; r.estado = 'pend'; }
      else {
        var fallaArea = r.caso !== 0 && r.caso !== 2 && r.pctNec !== null && r.pctNec > 1;
        var fallaAncho = (r.caso === 2 || r.caso === 3) && r.sd > num(sel.anchoReal);
        var fallaPeso = r.pctCarga !== null && r.pctCarga > 1;
        var sinNec = r.caso !== 0 && r.caso !== 2 && r.areaPermitida === null;
        if (fallaArea || fallaAncho || fallaPeso) {
          r.veredicto = '❌ NO CUMPLE —' + (fallaArea ? ' área NEC' : '') + (fallaAncho ? ' ancho' : '') + (fallaPeso ? ' peso/claro' : '');
          r.estado = 'error';
        } else if (sinNec) {
          r.veredicto = '⚠ sin dato NEC para el ancho de la canasta'; r.estado = 'warn';
        } else if (r.pctNec !== null && r.pctNec > reserva) {
          r.veredicto = '⚠ supera la reserva de diseño'; r.estado = 'warn';
        } else if (r.pctBruta !== null && r.factorFab !== null && r.pctBruta > r.factorFab) {
          r.veredicto = '⚠ ocupación bruta > fabricante'; r.estado = 'warn';
        } else {
          r.veredicto = '✔ CUMPLE'; r.estado = 'ok';
        }
      }
    }
    return r;
  }

  function referencia(canasta, p) {
    return (canasta.codigo || '') + (p.acabado || '');
  }

  /* Cálculo de un nivel completo (pestaña de nivel + fila resumen 360) */
  function calcularNivel(nivel, proyecto, cx) {
    var lineas = nivel.cables || [];
    var ids = (nivel.tramos || []).map(function (t) { return t.id; });
    var tramos = (nivel.tramos || []).map(function (t) { return calcularTramo(t, lineas, proyecto, cx); });
    var checks = lineas.map(function (l) {
      var c = chequearLinea(l, ids, cx);
      c.datos = datosLinea(l, cx);
      return c;
    });
    var res = { tramos: 0, cables: 0, errores: 0, advertencias: 0, longitud: 0, maxNec: null, maxCarga: null };
    tramos.forEach(function (r) {
      if (r.cables > 0) res.tramos++;
      res.cables += r.cables;
      if (r.estado === 'error') res.errores++;
      if (r.recomendadaTexto.charAt(0) === '❌') res.errores++;
      if (r.estado === 'warn') res.advertencias++;
      res.longitud += num(r.tramo.distancia) || 0;
      if (r.pctNec !== null) res.maxNec = res.maxNec === null ? r.pctNec : Math.max(res.maxNec, r.pctNec);
      if (r.pctCarga !== null) res.maxCarga = res.maxCarga === null ? r.pctCarga : Math.max(res.maxCarga, r.pctCarga);
    });
    checks.forEach(function (c) {
      if (c.nivel === 'error') res.errores++;
      if (c.nivel === 'warn') res.advertencias++;
    });
    return { nivel: nivel, tramos: tramos, checks: checks, resumen: res };
  }

  /* Memoria de cálculo del proyecto: Resumen + Detalle + listas de materiales */
  function calcularProyecto(proyecto, catalogo) {
    var cx = prepararCatalogo(catalogo);
    var niveles = (proyecto.niveles || []).map(function (n) { return calcularNivel(n, proyecto, cx); });
    var total = { tramos: 0, cables: 0, errores: 0, advertencias: 0, longitud: 0, maxNec: null, maxCarga: null };
    var bomCanastas = {}, bomCables = {}, detalle = [];
    niveles.forEach(function (nv) {
      var r = nv.resumen;
      ['tramos', 'cables', 'errores', 'advertencias', 'longitud'].forEach(function (k) { total[k] += r[k]; });
      if (r.maxNec !== null) total.maxNec = total.maxNec === null ? r.maxNec : Math.max(total.maxNec, r.maxNec);
      if (r.maxCarga !== null) total.maxCarga = total.maxCarga === null ? r.maxCarga : Math.max(total.maxCarga, r.maxCarga);

      nv.tramos.forEach(function (t, i) {
        // Lista de materiales de canasta: todo tramo con canasta seleccionada (igual que el Excel)
        if (t.seleccionada) {
          var k = t.seleccionada.id;
          if (!bomCanastas[k]) bomCanastas[k] = { canasta: t.seleccionada, marca: cx.marcas[t.seleccionada.marca], referencia: t.refSeleccionada, tramos: 0, longitud: 0 };
          bomCanastas[k].tramos++;
          bomCanastas[k].longitud += num(t.tramo.distancia) || 0;
        }
        if (t.cables > 0) detalle.push({ nivel: nv.nivel, num: i + 1, r: t });
      });

      // Cables: cantidad y longitud estimada (cantidad × distancia del tramo)
      var distPorTramo = {};
      nv.tramos.forEach(function (t) { distPorTramo[t.tramo.id] = num(t.tramo.distancia) || 0; });
      (nv.nivel.cables || []).forEach(function (l) {
        var cable = cx.cables[l.cable];
        var cant = num(l.cant);
        if (!cable || cant === null || !(l.tramo in distPorTramo)) return;
        if (!bomCables[cable.id]) bomCables[cable.id] = { cable: cable, cantidad: 0, longitud: 0, peso: 0 };
        bomCables[cable.id].cantidad += cant;
        bomCables[cable.id].longitud += cant * distPorTramo[l.tramo];
        bomCables[cable.id].peso += cant * distPorTramo[l.tramo] * 3.28084 * num(cable.peso) / 1000;
      });
    });

    var ordenCanasta = function (a, b) { return (a.canasta.orden || 0) - (b.canasta.orden || 0); };
    return {
      cx: cx,
      niveles: niveles,
      total: total,
      detalle: detalle,
      bomCanastas: Object.keys(bomCanastas).map(function (k) { return bomCanastas[k]; }).sort(ordenCanasta),
      bomCables: Object.keys(bomCables).map(function (k) { return bomCables[k]; })
        .sort(function (a, b) { return a.cable.nombre.localeCompare(b.cable.nombre); })
    };
  }

  global.Calc = {
    CLASES: [CLASE_MENOR, CLASE_MAYOR, CLASE_CONTROL],
    prepararCatalogo: prepararCatalogo,
    canastasDeMarca: canastasDeMarca,
    calcularTramo: calcularTramo,
    calcularNivel: calcularNivel,
    calcularProyecto: calcularProyecto,
    datosLinea: datosLinea
  };
})(typeof window !== 'undefined' ? window : globalThis);
