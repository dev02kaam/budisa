# Budisa

Plataforma Node.js para recibir y visualizar telemetría de los vehículos de Budisa. La integración principal usa un Teltonika FTC880 conectado por TCP a un gateway público en Railway; el gateway decodifica Codec 8 Extended y entrega los registros firmados a Budisa en Render mediante HTTPS.

## Arquitectura del tracker

```text
FTC880
  └─ TCP / Codec 8E
     crossover.proxy.rlwy.net:22945
        └─ gateway Railway (puerto interno 50027)
           └─ HTTPS firmado POST /tracker
              budisa.onrender.com
                 └─ MongoDB + mapa e histórico diario
```

Render continúa alojando la web y la API. Railway solo cubre la parte que Render no publica: el socket TCP binario al que se conecta el dispositivo.

## Configuración de producción

Variables de Budisa en Render:

```env
TELTONIKA_TCP_ENABLED=false
TELTONIKA_TCP_PORT=50027
TELTONIKA_PUBLIC_HOST=crossover.proxy.rlwy.net
TELTONIKA_PUBLIC_PORT=22945

TRACKER_SHARED_SECRET=un-secreto-largo-y-aleatorio
TRACKER_ADMIN_TOKEN=otra-clave-larga-solo-para-administrar-budisa
TRACKER_KEY_ID=gateway-v1
TRACKER_SIGNATURE_TOLERANCE_SECONDS=300
```

`TRACKER_SHARED_SECRET` y `TRACKER_KEY_ID` deben tener exactamente el mismo valor en Railway y Render. El secreto no debe guardarse en Git.

### Dónde guardar el secreto compartido

1. En Render, abre el Web Service de Budisa, entra en `Environment` y añade `TRACKER_SHARED_SECRET` con el valor elegido. Añade también `TRACKER_KEY_ID=gateway-v1` y una clave distinta en `TRACKER_ADMIN_TOKEN`; después guarda y despliega.
2. En Railway, abre el servicio del gateway TCP, entra en `Variables` y añade el mismo `TRACKER_SHARED_SECRET` y `TRACKER_KEY_ID=gateway-v1`; revisa y despliega los cambios.
3. `TRACKER_ADMIN_TOKEN` solo se configura en Render: protege las altas, aprobaciones y bloqueos realizados desde la vista `Estado`.
4. Para desarrollo local, coloca ambos valores únicamente en el archivo `.env`, que está ignorado por Git:

```env
TRACKER_SHARED_SECRET=pega_aqui_el_secreto
TRACKER_ADMIN_TOKEN=pega_aqui_otra_clave
```

Se puede generar un valor aleatorio de 32 bytes con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El IMEI es la identidad única del vehículo: no se configura ningún `truckId` ni nombre adicional. Los dispositivos se administran desde `Estado → Dispositivos Teltonika` y quedan guardados en MongoDB, no en variables de entorno.

Se puede registrar un IMEI antes de instalarlo o dejar que intente transmitir. En ese segundo caso Budisa lo guarda como pendiente y lo muestra para aprobación; mientras no se apruebe responde `403 UNKNOWN_DEVICE`, por lo que el gateway mantiene ACK cero. Una vez aprobado, el siguiente reintento se acepta.

El comando sigue disponible como alternativa de mantenimiento, pero no es necesario para la operación normal:

```bash
npm run tracker:register -- 862129089568731
```

Budisa ignora cualquier `truckId` enviado por el gateway y trabaja directamente con:

```text
IMEI recibido → Tracker registrado → posiciones del mismo IMEI
```

Hasta que el IMEI esté aprobado y activo, `/tracker` responde `403 UNKNOWN_DEVICE` y el gateway debe enviar ACK cero al Teltonika.

## Configuración manual del FTC880

En Teltonika Configurator:

```text
Domain:         crossover.proxy.rlwy.net
Port:           22945
Protocol:       TCP
Data Protocol:  Codec 8 Extended
TLS Encryption: None
```

El campo `Domain` no lleva `https://`: el equipo establece una conexión TCP directa.

## Contrato Railway → Render

El gateway envía `POST https://budisa.onrender.com/tracker` con JSON y estas cabeceras:

```text
X-Tracker-Key-Id: gateway-v1
X-Tracker-Timestamp: <unix-seconds>
X-Tracker-Nonce: <valor único>
X-Tracker-Content-SHA256: <sha256 del body original>
X-Tracker-Signature: v1=<hmac-sha256>
```

Budisa conserva el cuerpo original antes de parsear JSON, valida hash, HMAC, fecha y nonce; rechaza reenvíos y guarda cada `eventId` una sola vez. Una recepción completa responde exactamente:

```json
{
  "ok": true,
  "accepted": 10
}
```

Respuestas de error relevantes:

- `401 INVALID_SIGNATURE`: secreto, firma, timestamp o nonce incorrectos.
- `400 INVALID_PAYLOAD`: el paquete no cumple el esquema esperado.
- `403 UNKNOWN_DEVICE`: el IMEI no está asociado o está deshabilitado.
- `503 TRACKER_NOT_CONFIGURED`: falta `TRACKER_SHARED_SECRET` en Budisa.

## Mapa e histórico

La vista `Tracker GPS` incluye:

- posición y estado actual del dispositivo;
- velocidad, satélites, ignición y última conexión;
- recorrido del día con distancia, duración, puntos y velocidad máxima;
- selector de IMEI y de jornada;
- histórico diario;
- popup con el recorrido completo de cada día y marcadores de inicio/fin;
- estilo cartográfico propio de Budisa sobre datos de OpenStreetMap.

## Endpoints

- `GET /health`: salud de la web/API de Budisa.
- `POST /tracker`: recepción firmada desde Railway.
- `GET /api/tracker`: posiciones GPS, con filtros `imei`, `from`, `to` y `limit`.
- `GET /api/tracker/days`: resúmenes de recorridos diarios.
- `GET /api/tracker/status`: estado no sensible de la integración.
- `GET/POST /api/trackers`: consulta y alta protegidas del registro de IMEIs.
- `PATCH /api/trackers/:imei`: aprobación, reactivación o deshabilitación protegida.
- `POST /api/telemetry`: compatibilidad con la telemetría existente de la Raspberry.
- `GET /api/summary`: resumen general.
- `GET /api/events/search`: histórico y filtros.
- `GET /api/devices`: dispositivos conocidos.

## Receptor TCP directo opcional

El proyecto conserva un receptor nativo de IMEI + Codec 8 Extended para entornos que sí puedan publicar un puerto TCP. Se activa con:

```env
TELTONIKA_TCP_ENABLED=true
TELTONIKA_TCP_PORT=50027
```

En Render debe permanecer desactivado, porque su Web Service solo expone HTTP/HTTPS públicamente. En producción se usa el gateway Railway descrito arriba.

## Desarrollo

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

Configura `MONGODB_URI` o usa `USE_MEMORY_MONGO=true` para pruebas locales. Ejecuta las comprobaciones con:

```bash
npm test
```

La base actual también mantiene el dashboard, el histórico filtrable, la exportación CSV y la telemetría de la Raspberry.
