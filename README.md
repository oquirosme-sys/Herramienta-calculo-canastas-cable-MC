# Canastas MC — Memoria de cálculo

Herramienta web (HTML + JavaScript, sin dependencias ni compilación) para dimensionar canalizaciones portacables con cable MC:

- **Canasta y escalera** — NEC 2020 Art. 392.22(A) (área permitida / suma de diámetros) y carga máxima por claro del fabricante.
- **Ducto cuadrado (wireway)** — NEC 2020 Art. 376.22: Σ áreas ≤ 20 % de la sección; más de 30 conductores portadores → factores de 310.15(C)(1).
- **Llenado real** (área de cables ÷ área interior útil) — TIA-569 / BICSI: verde < 30 %, amarillo 30–40 %, naranja > 40 % (criterio Sinergia de prellenado), rojo > 50 % (NO CUMPLE). Límites ajustables en la pestaña Proyecto.

Nació del libro `Canasta_MC_V2_1.xlsx` y conserva sus fórmulas para canastas.

## Uso

| Pestaña | Contenido |
|---|---|
| **Proyecto** | Datos del proyecto, parámetros (reserva, canalización por defecto, acabado, marca de cable, tipo y claro, factores Sd, criterios del ducto y del llenado real con las recomendaciones TIA-569 / BICSI) y **niveles del edificio**. Cada nivel crea su propia pestaña. |
| **Nivel (una por nivel)** | Tramos (canalización, tipo, claro, distancia, tamaño seleccionado y recomendado, % NEC, % carga, % llenado real, veredicto) y cables por tramo, elegidos por material, # de conductores, calibre e hilos. |
| **Memoria de cálculo** | Resumen por nivel, canalizaciones por tamaño (metros y piezas), cables por tipo y detalle de cada tramo. Se imprime con el formato Sinergia (membrete, hoja carta) y se descarga en **Excel (.xlsx) con fórmulas vivas** o CSV. |
| **Ayuda** | Instrucciones y tabla NEC 392.22(A). |
| **Administración** | Solo con PIN de administrador: marcas, líneas de producto, tamaños (dimensiones y cargas por claro), cables, fabricantes, tipos de canasta, reservas y tabla NEC. |

## Catálogo de canalizaciones

| Marca | Línea | Fuente |
|---|---|---|
| Cablofil (Legrand) | Canasta de malla CF30 / CF54 / CF105 / CF150 / ZF150 | Excel original (Cablofil) |
| Cablofil (Legrand) | Escalera PW de acero galvanizado en caliente, Serie 1 NEMA 12C (claros 6, 8, 10, 12 ft) | Catálogo Cablofil 2025/2026, secc. B, págs. B.38-B.39 |
| Eaton (B-Line) | Escalera Series 2, 3, 4 y 5 de acero (claros 8, 10, 12, 16, 20 ft) | Catálogo Eaton B-Line *Cable Tray Systems*, secc. J |
| Eaton (B-Line) | Ducto cuadrado Lay-In Wireway Type 1 | Catálogo de wireway Eaton B-Line (ca304001en) |
| Schneider Electric (Square D) | Ducto cuadrado Square-Duct LDB NEMA 1 | Catálogo Square-Duct Class 5100 (5100CT0101) |

Schneider ya no fabrica escalera (vendió la línea Wibe en 2021), por eso no tiene esa línea. Los fabricantes no publican carga por claro para los ductos (soportes según NEC 376.30). En las escaleras Eaton, un claro menor que el primero publicado usa la carga de ese primer claro (conservador) y uno mayor que el último publicado lleva carga 0 = claro no permitido. **Verifique los datos contra el catálogo vigente antes de un entregable**; el administrador puede corregirlos en Administración.

## Sistema visual

- **Pantalla — Sinergia Suite**: barra de vidrio con «← Suite» primero, tesela squircle de la aplicación, secciones en pastillas, movimiento con inercia. La identidad se declara con `<body data-app="canastas">` y se pinta con `var(--app)`; los colores de estado (error, advertencia, cumple) no se redirigen. El color de «canastas» es provisional hasta registrarlo en `suite-color.css` del portal.
- **Impresión y Excel — Formato Sinergia**: hoja carta, membrete con logo (`img/sinergia-logo.jpg`) y datos de la empresa, pie de tres partes (documento · web y correo · página), Montserrat 11 pt, tablas numeradas («Tabla No. N») con reglas horizontales y sin relleno, y la criticidad solo como palabra en color.

## Ejecutar localmente

```bash
python -m http.server 8766
```

## Publicar en GitHub Pages

El flujo `.github/workflows/static.yml` publica la rama `main` en `https://oquirosme-sys.github.io/Herramienta-calculo-canastas-cable-MC/`.

## Estructura

```
index.html              Página principal (barra Sinergia Suite)
css/styles.css          Estilos de pantalla e impresión de la memoria (Formato Sinergia)
img/sinergia-logo.jpg   Logo del membrete
js/catalogo-base.js     Catálogo inicial: canastas, escaleras y ductos; cables Viakon/Condumex; tabla NEC
js/calc.js              Motor de cálculo (funciones puras)
js/excel-export.js      Descarga a Excel con fórmulas vivas
js/store.js             Capa de datos — hoy localStorage; en la fase 2, Supabase con la misma interfaz
js/auth.js              Permiso de administrador — hoy PIN local; en la fase 2, Supabase Auth
js/app.js               Interfaz
```

## Descarga a Excel

*Memoria de cálculo → Descargar Excel* genera AYUDA, Proyecto, Resumen, Detalle, una pestaña por nivel entre INICIO_NIVELES y FIN_NIVELES, NEC 392.22 y catálogos ocultos (Canastas, Lineas, Cables, Listas). Las celdas de resultado son fórmulas, con listas desplegables y semáforos; un nivel copiado en Excel se suma a los totales. En la lista de materiales se ocultan los tamaños y cables sin uso al exportar (conservan sus fórmulas). Funciona en Excel 2010 o posterior; requiere internet al exportar (carga ExcelJS desde cdnjs).

Validación: un proyecto con canasta, escalera Cablofil y Eaton, ducto Eaton y Schneider, sobrecarga y líneas incompletas da en Excel los mismos valores que la herramienta (186 comprobaciones; la única diferencia es el texto del aviso de cable vacío) y ninguna fórmula con error.

## Limitaciones actuales (fase 1)

- Los proyectos y el catálogo se guardan **en el navegador** de cada usuario. Use *Proyecto ▾ → Exportar/Importar* para respaldar o compartir.
- El PIN de administrador solo oculta la pestaña Administración; **no es seguridad real**. La protección efectiva llega con Supabase (roles + RLS).
- No se verifica ampacidad (392.80(A)), soportes (392.30 / 376.30) ni curvas. Los cables de control/señal no entran en el chequeo de área NEC 392.22.

## Fase 2 — Supabase (propuesta de tablas)

| Tabla | Campos principales |
|---|---|
| `marcas` | id, nombre |
| `lineas` | id, marca_id → marcas, sistema (`canasta` / `escalera` / `ducto`), nombre, acabados (text[]), claros (numeric[]), largo_pieza, nota |
| `tamanos` | id, linea_id → lineas, nombre, ancho_nom, alto_nom, ancho_real, alto_real, cargas (numeric[], una por claro), familia, codigo, orden |
| `fabricantes_cable` | id, nombre |
| `cables` | id, fabricante_id, nombre, material, conductores, calibre, hilos, aislamiento, articulo, clase, peso_lb_kft, diam_mm |
| `tipos_canasta` | id, nombre, base_nec (`ventilada` / `solido`) |
| `nec_392_22` | ancho_mm, ancho_in, col1, col3 |
| `proyectos` | id, numero, nombre, ubicacion, fecha, elaboro, parametros (jsonb), creado_por, actualizado |
| `niveles` | id, proyecto_id, nombre, orden |
| `tramos` | id, nivel_id, orden, nombre, linea_id, tipo_id, claro, tamano_id, distancia |
| `lineas_cable` | id, tramo_id, cable_id, cantidad |
| `perfiles` | user_id → auth.users, rol (`admin` / `usuario`) |

Políticas RLS: catálogos con lectura para usuarios autenticados y escritura solo para `rol = 'admin'`; proyectos con lectura/escritura para usuarios autenticados de la organización. `app.js` no cambia: solo se reemplazan `store.js` y `auth.js`.
