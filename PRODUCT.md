# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de operaciones de Budisa que necesita comprobar que los dispositivos instalados en los vehiculos estan conectados, conocer su ultima posicion y revisar por donde se desplazaron en un dia concreto.

## Product Purpose

Budisa recibe telemetria de dispositivos Teltonika, conserva las posiciones GPS y las convierte en una vista operativa del estado actual y del historico diario de cada vehiculo. El exito consiste en poder confirmar la recepcion de datos reales y reconstruir una ruta diaria de forma clara y fiable.

## Positioning

La plataforma une la recepcion validada de paquetes Teltonika con el contexto propio de los vehiculos de Budisa: el IMEI es la identidad unica del vehiculo y cada paquete solo se confirma cuando sus registros han sido aceptados y persistidos.

## Operating Context

- El FTC880 envia Codec 8 Extended por TCP al gateway publico de Railway.
- Railway valida y decodifica el paquete y envia un `POST /tracker` firmado a Budisa.
- El personal consulta posicion actual, velocidad, calidad GNSS, recorridos e historicos por dia desde el panel web.
- En una fase posterior se usara FTC887 con Bluetooth y EYE Sensor para avisos de angulo.

## Capabilities and Constraints

- Aplicacion Node.js/Express con frontend HTML, CSS y JavaScript y persistencia MongoDB.
- El gateway se autentica mediante HMAC con `TRACKER_SHARED_SECRET` y `TRACKER_KEY_ID`.
- La identidad del vehiculo es exclusivamente el IMEI registrado; no se configura `truckId` ni nombre adicional y nunca se confia en esos campos si llegan en el payload.
- Los IMEIs se guardan en MongoDB y se administran desde la aplicacion; los desconocidos aparecen pendientes hasta su aprobacion.
- Las acciones del registro de dispositivos requieren una clave de administracion independiente del secreto del gateway.
- La ingesta debe ser idempotente por `eventId` y admitir multiples registros por paquete.
- Railway expone el receptor TCP; Budisa recibe los registros normalizados mediante HTTPS.
- El mapa usa cartografia OpenStreetMap a traves de Leaflet y debe conservar la atribucion correspondiente.
- El primer dispositivo queda identificado por el IMEI `862129089568731`.

## Brand Commitments

- Nombre: Budisa.
- Conservar el logotipo existente en `public/assets/logoyfavicon.png`.
- Interfaz operativa en espanol.
- El mapa debe inspirarse en la densidad telematica de la referencia aportada, pero usar una identidad propia azul, grafito y turquesa de Budisa.

## Evidence on Hand

- Aplicacion funcional existente con dashboard, historicos y tracker GPS.
- Referencia visual aportada por el usuario de un panel telematico con mapa oscuro, recorrido resaltado y datos del dispositivo.
- Contrato de payload y firma HMAC aportado por el gateway Railway.
- No hay todavia datos GPS reales del dispositivo dentro del repositorio.

## Product Principles

- Mostrar primero si el dispositivo esta transmitiendo y donde se encuentra.
- Distinguir con claridad datos reales, estados vacios y errores de conexion.
- Conservar el recorrido completo y hacerlo explorable por fecha y vehiculo.
- Confirmar al gateway solamente los registros que Budisa ha aceptado.
- Preparar el modelo para nuevos datos Teltonika manteniendo el IMEI como unica identidad del dispositivo.
