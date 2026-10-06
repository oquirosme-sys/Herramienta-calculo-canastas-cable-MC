# Canastas MC — Memoria de cálculo

Herramienta web (HTML + JavaScript, sin dependencias ni compilación) para dimensionar canastas portacables con cable MC según **NEC 2020 Art. 392.22(A)**, la carga máxima por claro del fabricante y la ocupación bruta. Reemplaza al libro `Canasta_MC_V2_1.xlsx` y reproduce sus fórmulas.

## Uso

| Pestaña | Contenido |
|---|---|
| **Proyecto** | Datos del proyecto, parámetros (reserva, marca, acabado, tipo y claro por defecto, factores Sd) y **niveles del edificio**. Cada nivel que se agrega crea su propia pestaña. |
| **Nivel (una por nivel)** | Tabla de tramos (tipo, claro, distancia, canasta seleccionada y recomendada, % NEC, % carga, % ocupación bruta, veredicto) y lista de cables por tramo. |
| **Memoria de cálculo** | Resumen del edificio por nivel, canastas por tamaño (metros y piezas), cables por tipo (longitud y peso estimados) y detalle de cada tramo en uso. Se imprime o se guarda en PDF; se exporta a CSV y a **Excel (.xlsx) con fórmulas vivas**. |
| **Ayuda** | Instrucciones y tabla NEC 392.22(A) de referencia. |
| **Administración** | Solo con PIN de administrador: marcas, canastas (tamaños y cargas), cables, fabricantes, tipos de canasta, reservas y tabla NEC. |

Los catálogos que en el Excel estaban en hojas ocultas (Cables, Listas, CATALOGO MC, Canastas) solo se ven en **Administración**.

## Ejecutar localmente

Abrir `index.html` en el navegador, o servir la carpeta:

```bash
python -m http.server 8765
```

## Publicar en GitHub Pages

1. Subir esta carpeta a un repositorio de GitHub.
2. *Settings → Pages → Build and deployment → Deploy from a branch*, rama `main`, carpeta `/ (root)`.
3. La herramienta queda en `https://<usuario>.github.io/<repositorio>/`.

## Estructura

```
index.html              Página principal
css/styles.css          Estilos (incluye formato de impresión de la memoria)
js/catalogo-base.js     Catálogo inicial extraído del Excel (canastas Cablofil, cables Viakon/Condumex, tabla NEC)
js/calc.js              Motor de cálculo (funciones puras, réplica de las fórmulas del Excel)
js/store.js             Capa de datos — hoy localStorage; en la fase 2, Supabase con la misma interfaz
js/auth.js              Permiso de administrador — hoy PIN local; en la fase 2, Supabase Auth
js/app.js               Interfaz
```

## Descarga a Excel

*Memoria de cálculo → Descargar Excel* (o *Proyecto ▾ → Descargar Excel*) genera un libro con la misma estructura del original: AYUDA, Proyecto, Resumen, Detalle, una pestaña por nivel entre INICIO_NIVELES y FIN_NIVELES, NEC 392.22 y los catálogos ocultos (Canastas, Cables, Listas). Todas las celdas de resultado son fórmulas, con listas desplegables y semáforos; un nivel copiado en Excel se suma a los totales del Resumen. Funciona en cualquier Excel 2010 o posterior. Requiere internet al exportar (carga ExcelJS desde cdnjs).

## Validación contra el Excel

Los proyectos nuevos arrancan en blanco (sin datos ni niveles) para que el usuario los complete; los parámetros de cálculo traen los valores por defecto del Excel. El menú *Proyecto ▾ → Cargar proyecto de ejemplo* carga los datos de la pestaña N01. Los resultados coinciden con el Excel: tramo 1 → recomendada 2x20 (CF 54/500), 70,04 % NEC, 12,36 % carga, «⚠ supera la reserva de diseño»; tramo 2 → recomendada 2x18 (CF 54/450), área permitida 8 991,6 mm², 59,78 % NEC, 42,24 % carga, «✔ CUMPLE»; total 80 m de 4x18 (CF 105/450).

## Limitaciones actuales (fase 1)

- Los proyectos y el catálogo se guardan **en el navegador** de cada usuario. Use *Proyecto ▾ → Exportar/Importar* para respaldar o compartir.
- El PIN de administrador solo oculta la pestaña Administración en ese navegador; **no es seguridad real**. La protección efectiva llega con Supabase (roles + RLS).
- No se verifica ampacidad (392.80(A)), soportes (392.30) ni curvas. Los cables de control/señal no entran en el chequeo de área NEC.

## Fase 2 — Supabase (propuesta de tablas)

| Tabla | Campos principales |
|---|---|
| `marcas` | id, nombre, acabados (text[]), claros (numeric[]), largo_pieza, nota |
| `canastas` | id, marca_id → marcas, nombre, ancho_nom, alto_nom, ancho_real, alto_real, factor, cargas (numeric[], una por claro), serie, codigo, orden |
| `fabricantes_cable` | id, nombre |
| `cables` | id, fabricante_id → fabricantes_cable, nombre, clase, peso_lb_kft, diam_mm |
| `tipos_canasta` | id, nombre, base_nec (`ventilada` / `solido`) |
| `nec_392_22` | ancho_mm, ancho_in, col1, col3 |
| `proyectos` | id, numero, nombre, ubicacion, fecha, elaboro, parametros (jsonb), creado_por, actualizado |
| `niveles` | id, proyecto_id, nombre, orden |
| `tramos` | id, nivel_id, orden, nombre, tipo_id, claro, canasta_id, distancia |
| `lineas_cable` | id, tramo_id, cable_id, cantidad |
| `perfiles` | user_id → auth.users, rol (`admin` / `usuario`) |

Políticas RLS: catálogos con lectura para usuarios autenticados y escritura solo para `rol = 'admin'`; proyectos con lectura/escritura para usuarios autenticados de la organización. `app.js` no cambia: solo se reemplazan `store.js` y `auth.js`.
