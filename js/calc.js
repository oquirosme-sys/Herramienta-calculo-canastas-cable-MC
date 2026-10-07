/* Motor de cálculo — basado en las fórmulas de las pestañas de nivel (N01) de Canasta_MC_V2_1.xlsx.
 * Canasta y escalera: NEC 2020 Art. 392.22(A) (área permitida / suma de diámetros) y carga por claro.
 * Ducto cuadrado (wireway): NEC 2020 Art. 376.22 (≤ 20 % de la sección; > 30 conductores portadores → ajuste).
 * Llenado real (área de cables ÷ área interior útil): TIA-569 / BICSI (máx. 50 %) y criterio Sinergia (40 %).
 * Funciones puras: no tocan el DOM ni el almacenamiento. */
(function (global) {
  'use strict';

  var CLASE_MENOR = 'MC < 4/0';
  var CLASE_MAYOR = 'MC >= 4/0';
  var CLASE_CONTROL = 'CONTROL/SEÑAL';

  var CASOS = ['solo control/señal', '(A)(1) · todos < 4/0', '(A)(1)(a) · todos ≥ 4/0', '(A)(1)(b) · mezcla', '376.22 · ≤ 20 % de la sección'];
  var SISTEMAS = { canasta: 'Canasta', escalera: 'Escalera', ducto: 'Ducto cuadrado' };

  /* Valores por defecto de los criterios de llenado real */
  var LLENADO = { alerta: 0.30, sinergia: 0.40, maximo: 0.50 };

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
  function par(p, k, def) { var v = num(p[k]); return v === null ? def : v; }

  function prepararCatalogo(cat) {
    var nec = {};
    (cat.nec || []).forEach(function (r) { nec[Number(r.anchoMm)] = r; });
    return {
      raw: cat,
      cables: indexar(cat.cables),
      canastas: indexar(cat.canastas),
      marcas: indexar(cat.marcas),
      series: indexar(cat.series),
      tipos: indexar(cat.tiposCanasta),
      nec: nec
    };
  }

  /* Tamaños de una línea de producto (serie), en orden de recomendación */
  function canastasDeSerie(cx, serieId) {
    return (cx.raw.canastas || [])
      .filter(function (c) { return !serieId || c.serie === serieId; })
      .slice()
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  }

  /* Línea de producto efectiva de un tramo y sus valores derivados */
  function serieEfectiva(cx, tramo, p) {
    return cx.series[tramo.serie] || cx.series[p.serie] || (cx.raw.series || [])[0] || { id: '', sistema: 'canasta', claros: [], acabados: [] };
  }
  function claroEfectivo(serie, tramo, p) {
    var cl = (serie.claros || []).map(Number);
    if (num(tramo.claro) !== null) return num(tramo.claro);
    if (num(p.claro) !== null && cl.indexOf(num(p.claro)) >= 0) return num(p.claro);
    return cl.length ? cl[0] : num(p.claro);
  }
  function acabadoDe(serie, p) {
    var ac = serie.acabados || [];
    return ac.indexOf(p.acabado) >= 0 ? p.acabado : (ac[0] || '');
  }
  function referencia(cx, canasta, p) {
    var s = cx.series[canasta.serie] || {};
    return (canasta.codigo || '') + acabadoDe(s, p);
  }

  /* Columnas NEC 392.22 de la canasta/escalera: Col.1 / Col.3 (Col.2 / Col.4 base = mismas, luego − k·Sd) */
  function areaBaseNec(cx, canasta, ventilada) {
    var fila = cx.nec[Number(canasta.anchoNom)];
    if (!fila) return null;
    return num(ventilada ? fila.col1 : fila.col3);
  }
  function areaInterior(c) {
    var a = num(c.anchoReal), h = num(c.altoReal);
    return a !== null && h !== null ? a * h : null;
  }

  /* Área permitida NEC para un caso dado (columna N del Excel) */
  function areaPermitida(cx, canasta, caso, ventilada, factorSd, sd, factorDucto) {
    if (caso === 4) { var ai = areaInterior(canasta); return ai === null ? null : factorDucto * ai; }
    if (caso === 2) return 'n/a';
    var base = areaBaseNec(cx, canasta, ventilada);
    if (base === null) return null;
    return caso === 1 ? base : base - factorSd * sd;
  }

  function indiceClaro(serie, claro) {
    if (!serie || claro === null) return -1;
    var cl = serie.claros || [];
    for (var i = 0; i < cl.length; i++) if (Math.abs(Number(cl[i]) - claro) < 1e-6) return i;
    return -1;
  }

  function cargaMax(canasta, idxClaro) {
    if (!canasta || idxClaro < 0) return null;
    return num((canasta.cargas || [])[idxClaro]);
  }

  /* Área útil para el llenado real: ancho real × min(alto real, altura máx. de cómputo); el ducto usa su sección completa */
  function areaUtil(c, sistema, altoMax) {
    var a = num(c.anchoReal), h = num(c.altoReal);
    if (a === null || h === null) return null;
    return a * (sistema === 'ducto' ? h : Math.min(h, altoMax));
  }

  /* Estado del llenado real: ok < alerta ≤ «alerta» < sinergia ≤ «warn» < máximo < «error» */
  function estadoLlenado(v, p) {
    if (v === null || v === undefined) return '';
    if (v > par(p, 'llenadoMax', LLENADO.maximo)) return 'error';
    if (v > par(p, 'llenadoSinergia', LLENADO.sinergia)) return 'warn';
    if (v >= par(p, 'llenadoAlerta', LLENADO.alerta)) return 'alerta';
    return 'ok';
  }

  /* Validación de una línea de cable (columna Q del Excel) */
  function chequearLinea(linea, tramosIds, cx) {
    var vacia = !linea.cable && !linea.tramo && num(linea.cant) === null;
    if (vacia) return { aviso: '', nivel: '' };
    if (!linea.tramo) return { aviso: '❌ asigne el tramo', nivel: 'error' };
    if (tramosIds.indexOf(linea.tramo) < 0) return { aviso: '❌ tramo inválido', nivel: 'error' };
    var cable = cx.cables[linea.cable];
    if (!linea.cable) return { aviso: '❌ complete material, conductores y calibre', nivel: 'error' };
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
      areaTotal: 0, peso: 0, portadores: 0
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
      if (d.clase !== CLASE_CONTROL) r.portadores += cant * (atributosCable(d.cable).conductores || 0);
    });

    var serie = serieEfectiva(cx, tramo, p);
    r.serie = serie;
    r.sistema = serie.sistema || 'canasta';
    var ducto = r.sistema === 'ducto';

    // Caso NEC: 0 = vacío/solo control, 1 = todos < 4/0, 2 = todos ≥ 4/0, 3 = mezcla, 4 = ducto (376.22)
    if (r.cables === 0) r.caso = 0;
    else if (ducto) r.caso = 4;
    else r.caso = r.nMenor === 0 && r.nMayor === 0 ? 0 : (r.nMayor === 0 ? 1 : (r.nMenor === 0 ? 2 : 3));
    r.casoTexto = r.cables === 0 ? '' : CASOS[r.caso];

    var tipoId = tramo.tipo || p.tipo;
    var tipo = cx.tipos[tipoId];
    r.tipoNombre = ducto ? SISTEMAS.ducto : (tipo ? tipo.nombre : '');
    r.ventilada = !tipo || tipo.baseNec !== 'solido';
    r.factorSd = r.ventilada ? num(p.sdVentilada) : num(p.sdSolido);
    r.factorDucto = par(p, 'ductoFactor', 0.20);
    r.claro = claroEfectivo(serie, tramo, p);
    r.idxClaro = indiceClaro(serie, r.claro);
    var reserva = num(p.reserva);
    var altoMax = par(p, 'altoMax', 150);

    // Recomendada: la primera (menor sección) de la línea que cumple NEC con reserva + ancho + carga por claro
    r.recomendada = null;
    if (r.caso !== 0) {
      var lista = canastasDeSerie(cx, serie.id);
      for (var i = 0; i < lista.length; i++) {
        var c = lista[i];
        var okArea = true;
        if (ducto) {
          var apd = areaPermitida(cx, c, 4, true, 0, 0, r.factorDucto);
          okArea = apd !== null && r.areaTotal <= reserva * apd;
        } else if (r.caso !== 2) {
          var ap = areaPermitida(cx, c, r.caso, r.ventilada, r.factorSd, r.sd);
          okArea = ap !== null && r.areaMenor <= reserva * ap;
        }
        var okAncho = ducto || r.caso === 1 || r.sd <= num(c.anchoReal);
        var cm = cargaMax(c, r.idxClaro);
        var okCarga = cm === null ? true : r.peso <= cm;
        // Además, el llenado real no debe superar el criterio Sinergia de prellenado
        var au = areaUtil(c, r.sistema, altoMax);
        var okReal = au !== null && au > 0 && r.areaTotal / au <= par(p, 'llenadoSinergia', LLENADO.sinergia);
        if (okArea && okAncho && okCarga && okReal) { r.recomendada = c; break; }
      }
      r.recomendadaTexto = r.recomendada ? r.recomendada.nombre : '❌ ninguna cumple — divida el tramo';
    } else {
      r.recomendadaTexto = '';
    }
    r.refRecomendada = r.recomendada ? referencia(cx, r.recomendada, p) : '';

    // Tamaño seleccionado
    var sel = tramo.canasta ? cx.canastas[tramo.canasta] : null;
    r.seleccionada = sel || null;
    r.refSeleccionada = sel ? referencia(cx, sel, p) : '';
    r.areaPermitida = null; r.pctNec = null; r.cargaMax = null; r.pctCarga = null; r.pctBruta = null; r.estadoBruta = '';

    if (sel && r.caso !== 0) {
      r.areaPermitida = areaPermitida(cx, sel, r.caso, r.ventilada, r.factorSd, r.sd, r.factorDucto);
      if (r.caso === 2) r.pctNec = r.sd / num(sel.anchoReal);
      else if (r.areaPermitida === null) r.pctNec = null;
      else if (ducto) r.pctNec = r.areaPermitida > 0 ? r.areaTotal / r.areaPermitida : 9.99;
      else r.pctNec = r.areaPermitida <= 0 ? 9.99 : r.areaMenor / r.areaPermitida;
    }
    if (sel && r.cables > 0) {
      var serieSel = cx.series[sel.serie] || serie;
      r.cargaMax = cargaMax(sel, indiceClaro(serieSel, r.claro));
      // carga 0 = claro no permitido para ese tamaño (el fabricante no publica carga a ese claro)
      r.pctCarga = r.cargaMax === null ? null : (r.cargaMax > 0 ? r.peso / r.cargaMax : 9.99);
      r.areaBruta = areaUtil(sel, r.sistema, altoMax);
      r.pctBruta = r.areaBruta > 0 ? r.areaTotal / r.areaBruta : null;
      r.estadoBruta = estadoLlenado(r.pctBruta, p);
    }

    // Veredicto (columna T)
    r.veredicto = ''; r.estado = '';
    if (r.cables > 0) {
      if (!sel) { r.veredicto = '— seleccione tamaño'; r.estado = 'pend'; }
      else {
        var fallaArea = r.caso !== 0 && r.caso !== 2 && r.pctNec !== null && r.pctNec > 1;
        var fallaAncho = (r.caso === 2 || r.caso === 3) && r.sd > num(sel.anchoReal);
        var fallaPeso = r.pctCarga !== null && r.pctCarga > 1;
        var fallaReal = r.estadoBruta === 'error';
        var sinNec = r.caso !== 0 && r.caso !== 2 && r.areaPermitida === null;
        if (fallaArea || fallaAncho || fallaPeso || fallaReal) {
          r.veredicto = '❌ NO CUMPLE —' + (fallaArea ? (ducto ? ' área NEC 376.22' : ' área NEC') : '') + (fallaAncho ? ' ancho' : '') +
            (fallaPeso ? ' peso/claro' : '') + (fallaReal ? ' llenado real > ' + Math.round(par(p, 'llenadoMax', LLENADO.maximo) * 100) + ' % (TIA-569)' : '');
          r.estado = 'error';
        } else if (sinNec) {
          r.veredicto = ducto ? '⚠ faltan dimensiones del ducto' : '⚠ sin dato NEC para el ancho de la canasta'; r.estado = 'warn';
        } else if (r.pctNec !== null && r.pctNec > reserva) {
          r.veredicto = '⚠ supera la reserva de diseño'; r.estado = 'warn';
        } else if (r.estadoBruta === 'warn') {
          r.veredicto = '⚠ llenado real > ' + Math.round(par(p, 'llenadoSinergia', LLENADO.sinergia) * 100) + ' % (criterio Sinergia)'; r.estado = 'warn';
        } else if (ducto && r.portadores > par(p, 'ductoMaxConductores', 30)) {
          r.veredicto = '⚠ > ' + par(p, 'ductoMaxConductores', 30) + ' conductores portadores: aplique ajuste 310.15(C)(1)'; r.estado = 'warn';
        } else {
          r.veredicto = '✔ CUMPLE'; r.estado = 'ok';
        }
      }
    }
    return r;
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
    var res = { tramos: 0, cables: 0, errores: 0, advertencias: 0, longitud: 0, maxNec: null, maxCarga: null, maxReal: null };
    var maxi = function (a, b) { return b === null || b === undefined ? a : (a === null ? b : Math.max(a, b)); };
    tramos.forEach(function (r) {
      if (r.cables > 0) res.tramos++;
      res.cables += r.cables;
      if (r.estado === 'error') res.errores++;
      if (r.recomendadaTexto.charAt(0) === '❌') res.errores++;
      if (r.estado === 'warn') res.advertencias++;
      res.longitud += num(r.tramo.distancia) || 0;
      res.maxNec = maxi(res.maxNec, r.pctNec);
      res.maxCarga = maxi(res.maxCarga, r.pctCarga);
      res.maxReal = maxi(res.maxReal, r.pctBruta);
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
    var total = { tramos: 0, cables: 0, errores: 0, advertencias: 0, longitud: 0, maxNec: null, maxCarga: null, maxReal: null };
    var bomCanastas = {}, bomCables = {}, detalle = [];
    niveles.forEach(function (nv) {
      var r = nv.resumen;
      ['tramos', 'cables', 'errores', 'advertencias', 'longitud'].forEach(function (k) { total[k] += r[k]; });
      ['maxNec', 'maxCarga', 'maxReal'].forEach(function (k) {
        if (r[k] !== null) total[k] = total[k] === null ? r[k] : Math.max(total[k], r[k]);
      });

      nv.tramos.forEach(function (t, i) {
        // Lista de materiales: todo tramo con tamaño seleccionado (igual que el Excel)
        if (t.seleccionada) {
          var k = t.seleccionada.id;
          var s = cx.series[t.seleccionada.serie] || {};
          if (!bomCanastas[k]) bomCanastas[k] = { canasta: t.seleccionada, serie: s, marca: cx.marcas[s.marca || t.seleccionada.marca], referencia: t.refSeleccionada, tramos: 0, longitud: 0 };
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

    var ordenSeries = {};
    (catalogo.series || []).forEach(function (s, i) { ordenSeries[s.id] = i; });
    var ordenCanasta = function (a, b) {
      return ((ordenSeries[a.canasta.serie] || 0) - (ordenSeries[b.canasta.serie] || 0)) || ((a.canasta.orden || 0) - (b.canasta.orden || 0));
    };
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

  /* Normaliza un calibre: «12AWG» → «12 AWG», «4/0» → «4/0 AWG», «500» / «500kcmil» → «500 kcmil» */
  function normalizarCalibre(tok) {
    var t = String(tok || '').replace(/\s+/g, '').replace(/awg$/i, '').replace(/kcmil$/i, '');
    if (!t) return '';
    if (t.indexOf('/') > 0) return t + ' AWG';
    var n = Number(t);
    if (!isFinite(n)) return String(tok);
    return n >= 250 ? n + ' kcmil' : n + ' AWG';
  }
  /* Orden de calibres: 14, 12, 10 … 1, 1/0 … 4/0, 250 kcmil … */
  function ordenCalibre(cal) {
    var m = String(cal || '').match(/^(\d+)(\/0)?\s*(AWG|kcmil)?/i);
    if (!m) return 1e9;
    var n = Number(m[1]);
    if (m[2]) return n - 1;
    if (/kcmil/i.test(m[3] || '')) return 1000 + n;
    return -n;
  }
  /* Atributos de un cable (material, # conductores, calibre, hilos, aislamiento, artículo).
   * Usa los campos del catálogo y, si faltan, los deduce del nombre
   * («MC Cu THHN 3C 12AWG 19h (SLDM03) Viakon»). */
  function atributosCable(c) {
    var a = { material: c.material || '', conductores: num(c.conductores), calibre: c.calibre || '', hilos: c.hilos || '', aislamiento: c.aislamiento || '', articulo: c.articulo || '' };
    var m = String(c.nombre || '').match(/^MC\s+(Cu|Al)\s+(\S+)\s+(\d+)C\s+(\S+)(?:\s+(\d+h))?(?:\s+\(([^)]+)\))?/i);
    if (m) {
      if (!a.material) a.material = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      if (!a.aislamiento) a.aislamiento = m[2];
      if (a.conductores === null) a.conductores = Number(m[3]);
      if (!a.calibre) a.calibre = normalizarCalibre(m[4]);
      if (!a.hilos && m[5]) a.hilos = m[5];
      if (!a.articulo && m[6]) a.articulo = m[6];
    }
    return a;
  }
  function textoHilos(h) {
    if (!h) return 'Estándar';
    var n = parseInt(h, 10);
    return n === 1 ? 'Sólido (1 hilo)' : 'Cableado (' + n + ' hilos)';
  }

  global.Calc = {
    normalizarCalibre: normalizarCalibre,
    ordenCalibre: ordenCalibre,
    atributosCable: atributosCable,
    textoHilos: textoHilos,
    CLASES: [CLASE_MENOR, CLASE_MAYOR, CLASE_CONTROL],
    SISTEMAS: SISTEMAS,
    LLENADO: LLENADO,
    estadoLlenado: estadoLlenado,
    prepararCatalogo: prepararCatalogo,
    canastasDeSerie: canastasDeSerie,
    serieEfectiva: serieEfectiva,
    claroEfectivo: claroEfectivo,
    acabadoDe: acabadoDe,
    calcularTramo: calcularTramo,
    calcularNivel: calcularNivel,
    calcularProyecto: calcularProyecto,
    datosLinea: datosLinea
  };
})(typeof window !== 'undefined' ? window : globalThis);
