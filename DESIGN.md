---
name: Budisa Telemetría
description: Consola operativa para seguir vehículos, señales y recorridos reales.
colors:
  night-canvas: "#0b1020"
  night-surface: "#182338"
  night-text: "#eef4ff"
  night-muted: "#93a3c1"
  day-canvas: "#eef2f8"
  day-surface: "#ffffff"
  day-text: "#122033"
  day-muted: "#5d6a80"
  gnss-mint: "#61d8b9"
  route-teal: "#2dd4bf"
  budisa-blue: "#6ea8ff"
  route-blue: "#4f8cff"
  event-amber: "#f4b942"
  alert-coral: "#ff6c7a"
typography:
  display:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "2.2rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "1.34rem"
    fontWeight: 800
    lineHeight: 1.2
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  sm: "12px"
  md: "16px"
  lg: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  nav-default:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.sm}"
    padding: "14px 16px"
  map-action:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  route-card:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "14px"
---

# Design System: Budisa Telemetría

## Overview

**Creative North Star: "Centro de Control de Ruta"**

Budisa se expresa como una consola telemática sobria: mucha información útil, jerarquía inmediata y un mapa que se siente parte de la herramienta, no un contenido incrustado. El mundo visual combina grafito operativo, azul de marca, turquesa GNSS y pequeñas señales ámbar para que la lectura crítica destaque sin convertir cada bloque en una tarjeta protagonista.

La densidad es deliberadamente media-alta en escritorio y se reorganiza en una secuencia vertical clara en móvil. La apariencia debe seguir siendo digital y cartográfica; no se imitan metales, salpicaderos físicos ni materiales inexistentes.

**Key Characteristics:**

- Mapa dominante con cartografía desaturada y rutas de alto contraste.
- Superficies oscuras por capas, bordes finos y profundidad ambiental contenida.
- Métricas compactas con números claros y etiquetas técnicas en mayúsculas.
- Turquesa reservado para posición, transmisión y recorrido; azul para marca y navegación.
- Tema claro equivalente, sin perder la jerarquía operacional.

## Colors

La paleta parte de un lienzo azul medianoche y usa acentos fríos para estados confiables, con ámbar y coral únicamente en eventos o alertas.

### Primary

- **Menta GNSS:** indica sensores disponibles, señal positiva y estados conectados.
- **Turquesa de ruta:** dibuja trayectos y marcadores activos sobre la cartografía.

### Secondary

- **Azul Budisa:** enlaza navegación, iconografía de vehículo y acciones informativas con la marca.
- **Azul de destino:** diferencia el fin de un trayecto y estados secundarios del mapa.

### Tertiary

- **Ámbar de evento:** identifica sucesos puntuales que requieren lectura, sin semántica de error.
- **Coral de alerta:** se reserva para errores, eliminación y estados realmente adversos.

### Neutral

- **Lienzo medianoche y grafito de panel:** forman el fondo y las superficies del tema nocturno.
- **Blanco frío y gris azulado:** mantienen la lectura de texto y metadatos.
- **Lienzo niebla y superficie blanca:** trasladan la misma jerarquía al tema diurno.

**The Signal Economy Rule.** Los acentos saturados comunican estado, ruta o acción; no decoran superficies completas.

## Typography

**Display Font:** Inter, con Segoe UI y `system-ui` como alternativas.  
**Body Font:** Inter, con Segoe UI y `system-ui` como alternativas.  
**Label/Mono Font:** la misma familia, apoyada por números tabulares en métricas y coordenadas.

**Character:** una sans funcional, compacta y legible que mantiene el carácter de interfaz industrial sin parecer un panel físico. El peso, el tamaño y el color crean la jerarquía; no se añaden familias ornamentales.

### Hierarchy

- **Display:** peso 900 y trazo compacto para la marca lateral.
- **Headline:** peso 800 para títulos de vista y diálogos.
- **Title:** peso 700–800 para identidad de vehículo, paneles y días de ruta.
- **Body:** peso 400 con interlineado aproximado de 1.45 para instrucciones y metadatos.
- **Label:** peso 700, tamaño pequeño, mayúsculas y espaciado amplio para nombres de métricas.

**The Numeric Glance Rule.** Velocidad, hora, distancia y recuentos usan cifras tabulares y mayor contraste que sus etiquetas.

## Layout

El armazón de escritorio usa una navegación lateral fija y un área flexible. El tracker dispone el mapa y la consola en la columna principal, con el histórico diario en una columna secundaria de 300–330 px. La barra superior del dispositivo agrupa el IMEI, su selector y cuatro métricas; debajo, el mapa ocupa la mayor superficie, seguido por un resumen de ruta en cuatro columnas.

La vista Estado incorpora un registro de dispositivos antes de la línea de vida. En escritorio sus filas forman una tabla operativa de seis columnas; bajo 700 px, cada IMEI se convierte en una ficha vertical con las etiquetas visibles para no depender de una cabecera fuera de pantalla. El acceso administrativo y el alta manual permanecen dentro del mismo panel, claramente separados del estado de los dispositivos.

El ritmo se apoya sobre incrementos recurrentes de 8, 16 y 24 px. A 1180 px la navegación pasa arriba; a 1080 px el histórico baja bajo el mapa; a 700 px la navegación se compacta en cuatro accesos, las métricas y resúmenes usan dos columnas y las jornadas forman una sola lista. Los controles cartográficos se reordenan antes de reducir el área táctil.

**The Map-First Rule.** En una superficie de localización, la ruta y su contexto espacial conservan más área que cualquier lista o resumen asociado.

## Elevation & Depth

La profundidad combina capas tonales, bordes blancos de baja opacidad y sombras ambientales. Las sombras fuertes quedan para diálogos, marcadores y paneles principales; los elementos internos se separan sobre todo mediante divisores y cambios de tono.

### Shadow Vocabulary

- **Ambient panel:** `0 18px 46px rgba(3, 8, 16, 0.24)` para la consola y el histórico del tracker.
- **Floating control:** `0 10px 26px rgba(3, 8, 14, 0.3)` para controles colocados sobre el mapa.
- **Modal focus:** `0 28px 80px rgba(2, 7, 13, 0.46)` para aislar el recorrido diario.
- **Status halo:** anillos suaves alrededor de marcadores y estados GNSS, siempre ligados a datos.

**The Layer Before Shadow Rule.** Primero se diferencia una superficie por tono y borde; la sombra solo refuerza una elevación real.

## Shapes

Las superficies operativas usan esquinas de 12–16 px; las tarjetas de soporte heredadas pueden alcanzar 24 px. Los controles pequeños y acciones de mapa se mantienen cerca de 9–12 px. Los círculos y cápsulas se reservan para estados, contadores, marcadores y controles cuya geometría lo exige. Las rutas son líneas redondeadas con un casing oscuro para conservar contraste sobre calles complejas.

## Components

### Buttons

- **Shape:** rectángulos compactos con esquinas de 9–14 px.
- **Primary:** fondo de panel, texto frío y borde tenue; las acciones cartográficas usan 10 × 12 px de relleno.
- **Hover / Focus:** el borde gana turquesa o menta y puede elevarse 1 px; el foco siempre conserva un contorno visible.
- **Ghost:** fondo transparente en filas de jornada, con color tonal solo al pasar o seleccionar.

### Chips

- **Style:** contadores y estados usan cápsulas pequeñas, fondo tonal y texto del color semántico.
- **State:** la selección debe leerse también por borde o superficie, no únicamente por color.

### Cards / Containers

- **Corner Style:** 16 px en superficies principales y 12 px en filas internas.
- **Background:** grafito sólido o panel translúcido según el nivel de profundidad.
- **Shadow Strategy:** ambiental en el contenedor exterior; plana en bloques internos.
- **Border:** 1 px con baja opacidad para ordenar sin cuadricular en exceso.
- **Internal Padding:** 14–24 px según densidad y jerarquía.

### Inputs / Fields

- **Style:** fondo nocturno, borde fino, esquinas de 9–12 px y texto de alto contraste.
- **Focus:** cambio de borde hacia el acento; no se elimina el indicador del navegador sin sustitución.
- **Disabled:** menor contraste y cursor no interactivo.

### Navigation

La navegación combina un icono técnico y una etiqueta. En escritorio forma una columna; en tablet se alinea horizontalmente; en móvil usa cuatro accesos compactos. El activo se distingue por borde turquesa y tono de panel, manteniendo el nombre visible.

### Tracker GPS

La firma visual de la aplicación es la secuencia IMEI → métricas actuales → mapa → resumen → jornadas. La cartografía se desatura mediante filtros, la ruta turquesa lleva casing oscuro y el popup de jornada muestra cuatro métricas antes de los marcadores A/B.

### Registro de dispositivos

Cada fila prioriza el IMEI en cifras tabulares, seguido de estado, primera detección, último intento, último dato aceptado y acción. Activo usa menta, pendiente usa ámbar y deshabilitado permanece neutro. La aprobación es directa; la deshabilitación exige confirmación porque altera la recepción de posiciones.

## Do's and Don'ts

### Do:

- **Do** mantener el mapa como foco cuando la tarea principal sea comprender movimiento o ubicación.
- **Do** mostrar la hora real del GPS cuando exista y separar claramente datos actuales de rutas históricas.
- **Do** usar divisores, alineación y cifras tabulares para hacer escaneables las métricas densas.
- **Do** conservar atribución visible cuando se utilice cartografía de OpenStreetMap.

### Don't:

- **Don't** usar turquesa, ámbar o coral como decoración sin significado operativo.
- **Don't** presentar datos sintéticos como si provinieran de un dispositivo real.
- **Don't** convertir cada métrica en una tarjeta flotante independiente.
- **Don't** imitar Google Maps ni un salpicadero físico; la herramienta debe conservar identidad cartográfica propia de Budisa.
