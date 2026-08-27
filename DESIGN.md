---
name: Budisa Control de Flota
description: Consola operativa para localizar vehículos, comprobar su señal y reconstruir jornadas.
colors:
  night-canvas: "#0b1220"
  night-sidebar: "#101c2c"
  night-surface: "#142136"
  night-surface-strong: "#18283e"
  night-text: "#eff5ff"
  night-muted: "#9aabc2"
  day-canvas: "#edf2f8"
  day-surface: "#ffffff"
  day-text: "#122033"
  day-muted: "#5c6b7e"
  budisa-blue: "#70a8ff"
  gnss-mint: "#62d8ba"
  route-teal: "#2dd4bf"
  event-amber: "#f4b942"
  alert-coral: "#ff7180"
typography:
  display:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "1.24rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.13em"
  headline:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 2vw, 1.62rem)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  nav-active:
    backgroundColor: "{colors.night-surface-strong}"
    textColor: "{colors.gnss-mint}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "48px"
  quiet-button:
    backgroundColor: "{colors.night-surface-strong}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  field:
    backgroundColor: "{colors.night-canvas}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.sm}"
    padding: "11px 12px"
  status-chip:
    backgroundColor: "{colors.night-surface-strong}"
    textColor: "{colors.gnss-mint}"
    rounded: "{rounded.pill}"
    padding: "5px 9px"
  route-day:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "14px"
---

# Design System: Budisa Control de Flota

## Overview

**Creative North Star: "Centro de Control de Ruta"**

Budisa se expresa como una consola telemática sobria y compacta. La cartografía ocupa el centro de la experiencia, mientras que matrícula, IMEI, conexión y fix GPS se leen de un vistazo alrededor de ella. El mundo visual combina grafito azulado, azul de marca y señales turquesa; el ámbar y el coral solo aparecen cuando el estado exige atención.

La densidad es media-alta en escritorio y se convierte en una secuencia vertical clara en móvil. La interfaz permanece digital y cartográfica: no imita Google Maps, salpicaderos físicos, metal ni instrumental analógico.

**Key Characteristics:**

- Mapa dominante con cartografía desaturada y recorridos de alto contraste.
- Cinco tareas estables: Dashboard, Mapa en vivo, Histórico, Estado y Vehículos.
- Matrícula como lectura primaria e IMEI como verificación técnica.
- Superficies tonales, bordes finos y profundidad ambiental contenida.
- Tema oscuro principal y tema claro con la misma jerarquía semántica.

## Colors

El tema nocturno parte de un lienzo azul profundo y separa niveles con superficies grafito; el diurno conserva el mismo contraste sobre niebla y blanco.

### Primary

- **Menta GNSS:** conexión reciente, fix válido, aprobación y foco accesible.
- **Turquesa de ruta:** trayectos, marcadores activos y énfasis espacial.

### Secondary

- **Azul Budisa:** marca, navegación y acciones informativas.

### Tertiary

- **Ámbar de evento:** espera, dispositivo pendiente y estados que requieren revisión.
- **Coral de alerta:** errores y acciones adversas como deshabilitar.

### Neutral

- **Lienzo nocturno, barra lateral y superficies grafito:** profundidad funcional del modo oscuro.
- **Texto frío y gris azulado:** lectura principal y metadatos.
- **Lienzo niebla, blanco y tinta técnica:** equivalentes del modo claro.

**The Signal Economy Rule.** Los acentos saturados comunican estado, ruta o acción; nunca decoran paneles completos.

## Typography

**Display Font:** Inter, con Segoe UI y `system-ui` como alternativas.  
**Body Font:** Inter, con Segoe UI y `system-ui` como alternativas.  
**Label/Mono Font:** la misma familia con cifras tabulares para IMEIs, horas, distancias y coordenadas.

**Character:** sans funcional y compacta, con pesos altos en títulos y etiquetas pequeñas espaciadas para conservar una lectura industrial sin disfraz físico.

### Hierarchy

- **Display:** peso 900, reservado a la marca Budisa.
- **Headline:** peso 800, para el título de cada vista y del diálogo de ubicación.
- **Title:** peso 700, para vehículos, secciones y jornadas.
- **Body:** peso 400 e interlineado 1.45, para instrucciones y metadatos.
- **Label:** peso 700, mayúsculas y espaciado amplio, para métricas y columnas.

**The Numeric Glance Rule.** Horas, coordenadas, recuentos e IMEIs usan cifras tabulares y más contraste que sus etiquetas.

## Layout

En escritorio, una barra lateral fija de 248 px acompaña un área flexible. El Dashboard funciona como resumen: un mapa compacto queda entre dos raíles de métricas y la flota actual ocupa una franja inferior. Mapa en vivo elimina las métricas y dedica la superficie al seguimiento de los vehículos elegidos mediante un selector flotante. Histórico usa una barra de filtros seguida por totales y jornadas; Estado y Vehículos utilizan filas tabulares de alta densidad.

El ritmo recurrente es de 8, 16 y 24 px. A 1240 px se reduce la composición del Dashboard; a 980 px la navegación pasa arriba y las columnas se apilan; a 700 px cada fila se transforma en ficha etiquetada, y a 430 px se comprimen controles y tipografía sin reducir las áreas táctiles.

**The Map-First Rule.** Cuando la tarea es comprender movimiento o ubicación, la cartografía conserva más área que cualquier lista o resumen asociado.

El acceso abre en una escena nocturna propia: el panel de credenciales comparte marca, tipografía y señales de ruta con la consola, mientras una geometría cartográfica abstracta comunica el contexto sin exponer datos. Las operaciones de Vehículos usan una capa de sincronización con foco protegido y mensaje concreto hasta que todas las vistas están actualizadas. El alta masiva aparece como una acción secundaria compacta junto a la explicación del registro automático.

## Elevation & Depth

La profundidad combina capas tonales, bordes claros de baja opacidad y sombras ambientales. El panel principal usa una sombra difusa; controles sobre el mapa y el diálogo de ubicación elevan un nivel adicional. Los elementos internos permanecen planos salvo que floten realmente.

### Shadow Vocabulary

- **Panel ambiental:** sombra extensa y tenue para superficies principales.
- **Control flotante:** sombra media para leyendas y controles cartográficos.
- **Foco modal:** sombra profunda para aislar la posición de una basculación.

**The Layer Before Shadow Rule.** Primero se diferencia una superficie por tono y borde; la sombra solo refuerza una elevación real.

## Shapes

Las superficies principales usan esquinas de 16 px; filas, navegación y paneles secundarios, 12 px; campos y botones compactos, 10 px. Las cápsulas se reservan para estados y contadores. Marcadores y puntos de conexión son circulares; las rutas usan extremos redondeados y un casing oscuro para conservar contraste sobre calles complejas.

## Components

### Buttons

- **Shape:** rectángulos compactos con esquinas de 10 px.
- **Primary:** fondo de superficie reforzada, texto frío y relleno contenido.
- **Hover / Focus:** borde hacia menta, elevación máxima de 1 px y contorno visible.
- **Ghost:** transparente en filas y acciones secundarias; el estado aparece por tono y borde.

### Chips

- **Style:** cápsulas pequeñas con fondo tonal y texto del color semántico.
- **State:** autorización, conexión y fix conservan texto explícito; el color nunca actúa solo.

### Cards / Containers

- **Corner Style:** 16 px en paneles y 12 px en filas internas.
- **Background:** grafito sólido o blanco según el tema.
- **Shadow Strategy:** ambiental en el contenedor exterior y plana en bloques internos.
- **Border:** un píxel de baja opacidad para ordenar sin cuadricular.
- **Internal Padding:** 14–24 px según densidad y jerarquía.

### Inputs / Fields

- **Style:** fondo de campo, borde fino, esquinas de 10 px y texto de alto contraste.
- **Focus:** contorno menta de 2 px con separación exterior.
- **Error / Disabled:** coral para error; menor contraste y cursor no interactivo para deshabilitado.

### Navigation

Cada acceso combina icono técnico y etiqueta. Es una columna en escritorio, una fila superior bajo 980 px y cuatro accesos compactos en móvil. El activo usa menta, superficie tonal y borde; el nombre permanece visible.

### Mapa operativo

Los marcadores muestran la matrícula y distinguen movimiento, detención y ausencia de enlace. Mapa en vivo conserva la selección y traza en turquesa los puntos recibidos durante la sesión. Histórico despliega las basculaciones dentro de cada jornada y cada coordenada abre un mapa puntual.

### Filas de dispositivo

Dashboard prioriza métricas agregadas y una lectura básica por matrícula; Mapa en vivo limita el contenido a matrícula y actividad. Estado mantiene una lectura no editable. Vehículos asocia matrícula e IMEI; pendiente usa ámbar, activo menta y deshabilitado un tono neutro.

## Do's and Don'ts

### Do:

- **Do** usar la matrícula en la operación y mostrar el IMEI solo donde sea necesaria la verificación técnica.
- **Do** mostrar la hora real del GPS y separar claramente estado actual de rutas históricas.
- **Do** usar divisores, alineación y cifras tabulares para escanear datos densos.
- **Do** conservar visible la atribución de OpenStreetMap.

### Don't:

- **Don't** usar turquesa, ámbar o coral sin significado operativo.
- **Don't** presentar datos sintéticos como si provinieran de un dispositivo real.
- **Don't** convertir cada métrica en una tarjeta flotante independiente.
- **Don't** imitar Google Maps ni un salpicadero físico.
