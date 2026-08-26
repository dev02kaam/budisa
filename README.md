# Budisa · Control de flota

Plataforma Node.js para recibir y visualizar posiciones GPS de los vehículos de Budisa. El Teltonika FTC880 se conecta por TCP a un gateway público en Railway; el gateway decodifica Codec 8 Extended y entrega los registros firmados a Budisa en Render mediante HTTPS.

## Arquitectura

```text
FTC880
  └─ TCP / Codec 8E
     crossover.proxy.rlwy.net:22945
        └─ gateway Railway (puerto interno 50027)
           └─ HTTPS firmado POST /tracker
              budisa.onrender.com
                 └─ MongoDB + Dashboard + histórico de rutas
```

Render aloja la web y la API. Railway publica únicamente el socket TCP binario que Render no puede exponer.

## Identidad de los dispositivos

- El **IMEI** es la identidad técnica única del dispositivo y la clave que relaciona todas sus posiciones.
- El **nombre operativo** es una etiqueta editable —por ejemplo, `Hormigonera 01`— para que el trabajador reconozca el vehículo.
- Ambos se guardan en MongoDB; no se añade una variable de entorno por camión.
- Un IMEI desconocido se registra automáticamente como pendiente. Desde **Dispositivos** se le asigna un nombre y se aprueba.
- Un dispositivo pendiente o deshabilitado no puede guardar posiciones y produce `403 UNKNOWN_DEVICE`, por lo que el gateway responde ACK cero al Teltonika.

También puede registrarse de antemano desde consola:

```bash
npm run tracker:register -- 862129089568731 "Hormigonera 01"
```

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

`TRACKER_SHARED_SECRET` y `TRACKER_KEY_ID` deben coincidir en Railway y Render. `TRACKER_ADMIN_TOKEN` solo se configura en Render y permite gestionar la pestaña Dispositivos. Ningún secreto debe guardarse en Git.

Para desarrollo local, coloca los valores en `.env`, que está ignorado por Git. Puedes generar una clave aleatoria de 32 bytes con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Configuración manual del FTC880

En Teltonika Configurator:

```text
Domain:         crossover.proxy.rlwy.net
Port:           22945
Protocol:       TCP
Data Protocol:  Codec 8 Extended
TLS Encryption: None
```

`Domain` no lleva `https://`: el equipo establece una conexión TCP directa.

## Contrato Railway → Render

El gateway envía `POST https://budisa.onrender.com/tracker` con JSON y estas cabeceras:

```text
X-Tracker-Key-Id: gateway-v1
X-Tracker-Timestamp: <unix-seconds>
X-Tracker-Nonce: <valor único>
X-Tracker-Content-SHA256: <sha256 del body original>
X-Tracker-Signature: v1=<hmac-sha256>
```

Budisa conserva el cuerpo original antes de parsear JSON, valida hash, HMAC, fecha y nonce, rechaza reenvíos y guarda cada `eventId` una sola vez. Una recepción completa responde:

```json
{
  "ok": true,
  "accepted": 10
}
```

Errores relevantes:

- `401 INVALID_SIGNATURE`: secreto, firma, timestamp o nonce incorrectos.
- `400 INVALID_PAYLOAD`: el paquete no cumple el esquema esperado.
- `403 UNKNOWN_DEVICE`: el IMEI está pendiente o deshabilitado.
- `503 TRACKER_NOT_CONFIGURED`: falta `TRACKER_SHARED_SECRET`.

## Interfaz

- **Dashboard:** resumen de toda la flota, mapa de últimas posiciones, búsqueda y detalle del dispositivo seleccionado.
- **Histórico:** filtro por nombre o IMEI, vehículo y fechas; totales por jornada y popup con el recorrido completo.
- **Estado:** tabla operativa con nombre, IMEI, autorización, conexión, fix GPS y última recepción.
- **Dispositivos:** alta, asignación o cambio de nombre, aprobación, deshabilitación y reactivación mediante clave de administrador.

El mapa usa Leaflet sobre cartografía OpenStreetMap con un tratamiento visual propio de Budisa.

## Endpoints

- `GET /health`: salud de la web/API.
- `POST /tracker`: recepción firmada desde Railway.
- `GET /api/fleet`: estado actual agregado de todos los dispositivos.
- `GET /api/tracker`: posiciones GPS filtradas por `imei`, `from` y `to`.
- `GET /api/tracker/days`: recorridos agrupados por día y dispositivo.
- `GET /api/tracker/status`: estado no sensible de la integración.
- `GET/POST /api/trackers`: listado y alta protegidos del registro.
- `PATCH /api/trackers/:imei`: renombrado, aprobación, reactivación o deshabilitación protegidos.

## Receptor TCP directo opcional

En un entorno que publique puertos TCP puede activarse el receptor nativo:

```env
TELTONIKA_TCP_ENABLED=true
TELTONIKA_TCP_PORT=50027
```

En Render permanece desactivado; producción usa el gateway Railway descrito arriba.

## Desarrollo

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Configura `MONGODB_URI` o usa `USE_MEMORY_MONGO=true` para pruebas locales. Ejecuta las comprobaciones con:

```bash
npm test
```
