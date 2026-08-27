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
- La **matrícula** es la única identificación operativa visible para reconocer el vehículo rápidamente.
- IMEI y matrícula se guardan en MongoDB; no se añade una variable de entorno por camión.
- Un IMEI desconocido se registra automáticamente como pendiente. Desde **Vehículos** se le asigna la matrícula antes de aprobarlo.
- Un dispositivo pendiente o deshabilitado no puede guardar posiciones y produce `403 UNKNOWN_DEVICE`, por lo que el gateway responde ACK cero al Teltonika.

También puede registrarse de antemano desde consola:

```bash
npm run tracker:register -- 862129089568731 "1234 ABC" "Hormigonera 01"
```

Para altas masivas, la pestaña **Vehículos** admite CSV de hasta 250 filas, separado por comas o punto y coma:

```csv
imei,matricula
862129089568731,1234 ABC
```

La importación valida cada fila, informa de IMEIs repetidos o campos incorrectos y actualiza también los vehículos que ya existan.

## Configuración de producción

Variables de Budisa en Render:

```env
TELTONIKA_TCP_ENABLED=false
TELTONIKA_TCP_PORT=50027
TELTONIKA_PUBLIC_HOST=crossover.proxy.rlwy.net
TELTONIKA_PUBLIC_PORT=22945

TRACKER_SHARED_SECRET=un-secreto-largo-y-aleatorio
TRACKER_KEY_ID=gateway-v1
TRACKER_SIGNATURE_TOLERANCE_SECONDS=300

APP_LOGIN_USER=admin
APP_LOGIN_PASSWORD="una-contrasena-privada"
APP_SESSION_HOURS=12
APP_COOKIE_SECURE=true
```

`TRACKER_SHARED_SECRET` y `TRACKER_KEY_ID` deben coincidir en Railway y Render. Las variables `APP_LOGIN_*` solo se configuran en Render y protegen la aplicación completa; si la contraseña contiene `#`, debe ir entre comillas. Ningún secreto debe guardarse en Git.

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

Para alimentar el histórico operativo, cada registro puede incluir `io.known.movement`. Una basculación se registra en la transición de `io.known.tipperRaised` de falso a verdadero. La integración futura con EYE también reconoce `tiltAngleDeg` y considera el volquete elevado desde 25 grados. Si el FTC880 no envía ninguna de esas señales, la jornada indica correctamente que no hay basculaciones registradas.

Errores relevantes:

- `401 INVALID_SIGNATURE`: secreto, firma, timestamp o nonce incorrectos.
- `400 INVALID_PAYLOAD`: el paquete no cumple el esquema esperado.
- `403 UNKNOWN_DEVICE`: el IMEI está pendiente o deshabilitado.
- `503 TRACKER_NOT_CONFIGURED`: falta `TRACKER_SHARED_SECRET`.

## Interfaz

- **Dashboard:** resumen ejecutivo de toda la flota activa, mapa compacto de últimas posiciones, métricas de actividad y búsqueda exclusiva por matrícula.
- **Mapa en vivo:** mapa operativo dedicado con selección de uno, varios o todos los vehículos activos. Actualiza cada 5 segundos, conserva la selección y dibuja el movimiento recibido durante la sesión.
- **Histórico:** filtro por matrícula y fechas; muestra matrícula, jornada, tiempo en movimiento y una carpeta desplegable de basculaciones. Cada coordenada abre un mapa puntual.
- **Estado:** tabla operativa con matrícula, IMEI, autorización, conexión, fix GPS y última recepción.
- **Vehículos:** detección automática de nuevos IMEIs, alta individual, importación CSV, cambio de matrícula, aprobación, deshabilitación y reactivación dentro de la sesión privada. Durante cada cambio se muestra un loader hasta que todas las vistas quedan sincronizadas.

El mapa usa Leaflet sobre cartografía OpenStreetMap con un tratamiento visual propio de Budisa.

## Endpoints

- `GET /health`: salud de la web/API.
- `POST /tracker`: recepción firmada desde Railway.
- `POST /auth/login`, `GET /auth/session`, `POST /auth/logout`: acceso y sesión privada.
- `GET /api/fleet`: estado actual agregado de todos los dispositivos.
- `GET /api/tracker`: posiciones GPS filtradas por `imei`, `from` y `to`.
- `GET /api/tracker/days`: tiempo en movimiento y basculaciones agrupados por matrícula y día.
- `GET /api/tracker/status`: estado no sensible de la integración.
- `GET/POST /api/trackers`: listado y alta protegidos del registro.
- `POST /api/trackers/import`: alta o actualización masiva de hasta 250 vehículos.
- `PATCH /api/trackers/:imei`: cambio de matrícula, aprobación, reactivación o deshabilitación protegidos.

Todos los endpoints `/api/*` requieren la cookie de sesión de la aplicación. Las operaciones que modifican datos también requieren el token CSRF entregado al iniciar sesión.

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
