# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de operaciones de Budisa que necesita comprobar qué vehículos están transmitiendo, conocer su última posición y revisar por dónde se desplazaron en una jornada concreta.

## Product Purpose

Budisa recibe telemetría de dispositivos Teltonika, conserva las posiciones GPS y las convierte en una vista operativa del estado actual y del histórico diario de cada vehículo. El éxito consiste en confirmar la recepción de datos reales, identificar cada unidad sin ambigüedad y reconstruir sus rutas de forma clara.

## Positioning

La plataforma une la recepción validada de paquetes Teltonika con el lenguaje diario de la flota. El IMEI es la identidad técnica única e inmutable; la matrícula es la única identificación operativa visible para el trabajador.

## Operating Context

- El FTC880 envía Codec 8 Extended por TCP al gateway público de Railway.
- Railway valida y decodifica el paquete y envía un `POST /tracker` firmado a Budisa.
- Un IMEI desconocido aparece automáticamente como pendiente en Vehículos.
- Un administrador asigna la matrícula y aprueba, edita, deshabilita o reactiva el vehículo desde la aplicación.
- El personal consulta la flota actual, seguimiento selectivo, estado de conexión, fix GPS y recorridos diarios desde cinco vistas: Dashboard, Mapa en vivo, Histórico, Estado y Vehículos.
- Toda la consola queda detrás de un inicio de sesión privado; el receptor firmado `POST /tracker` permanece independiente para el gateway.
- En una fase posterior se usará FTC887 con Bluetooth y EYE Sensor para avisos de ángulo.

## Capabilities and Constraints

- Aplicación Node.js/Express con frontend HTML, CSS y JavaScript y persistencia MongoDB.
- El gateway se autentica mediante HMAC con `TRACKER_SHARED_SECRET` y `TRACKER_KEY_ID`.
- El IMEI identifica técnicamente al dispositivo; la matrícula no sustituye al IMEI ni interviene en la ingesta.
- Los IMEIs y matrículas se guardan en MongoDB, nunca como una variable de entorno por camión.
- Los desconocidos permanecen pendientes hasta recibir matrícula y aprobación administrativa.
- La web y sus APIs requieren una sesión privada almacenada en cookie segura; las escrituras validan además un token CSRF.
- El Dashboard consulta solo la jornada actual y el Histórico carga bajo demanda el intervalo seleccionado.
- Vehículos permite alta individual o importación CSV de hasta 250 filas, con validación y resultados por fila.
- Al guardar vehículos, la interfaz bloquea nuevas acciones y mantiene un loader hasta refrescar registro, flota e histórico visible.
- La ingesta es idempotente por `eventId` y admite múltiples registros por paquete.
- Railway expone el receptor TCP; Budisa recibe los registros normalizados mediante HTTPS.
- El mapa usa cartografía OpenStreetMap mediante Leaflet y conserva su atribución.
- El primer dispositivo tiene el IMEI `862129089568731`; su matrícula se gestiona desde Vehículos.

## Brand Commitments

- Nombre: Budisa.
- Conservar el logotipo existente en `public/assets/logoyfavicon.png`.
- Interfaz operativa en español.
- El mapa se inspira en la densidad telemática de la referencia aportada, con identidad propia azul, grafito y turquesa de Budisa.

## Evidence on Hand

- Aplicación funcional con recepción Teltonika, Dashboard, Mapa en vivo, Histórico, Estado y Vehículos.
- Referencia visual aportada por el usuario de un panel telemático con mapa oscuro, recorrido resaltado y datos del dispositivo.
- Contrato de payload y firma HMAC aportado por el gateway Railway.
- No hay todavía datos GPS reales confirmados del FTC880 dentro del repositorio.

## Product Principles

- Mostrar primero qué dispositivo está transmitiendo y dónde se encuentra.
- Presentar la matrícula como identidad operativa y reservar el IMEI para Vehículos y Estado.
- Distinguir con claridad datos reales, estados vacíos y errores de conexión.
- Agrupar por fecha el tiempo en movimiento y las basculaciones, con acceso a la posición exacta de cada evento.
- Confirmar al gateway solamente los registros que Budisa ha aceptado.
- Preparar el modelo para nuevos datos Teltonika manteniendo el IMEI como identidad técnica única.
