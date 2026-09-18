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

Para altas masivas, la pestaña **Vehículos** admite CSV de hasta 250 filas, separado por punto y coma o comas. La plantilla usa punto y coma para que Excel en español muestre cada campo en su propia columna:

```csv
imei;matricula
862129089568731;1234 ABC
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

La cadena firmada es exactamente esta, sin una línea final adicional:

```text
v1
TIMESTAMP
NONCE
SHA256_DEL_BODY
```

El hash y la firma se calculan sobre los bytes JSON enviados, no sobre una serialización posterior del objeto.

```json
{
  "ok": true,
  "accepted": 10
}
```

Para alimentar el histórico operativo, cada registro puede incluir `io.known.movement`. Las basculaciones se reconstruyen emparejando la lectura de subida con la de bajada, por IMEI y hora del dispositivo. Se reconoce `io.known.tipperRaised`, los ángulos normalizados como `tiltAngleDeg` y el ángulo **Roll del EYE Sensor 1** recibido en `io.raw[10832]` (entero de 16 bits con signo). Referencia: [tabla AVL del FTC887](https://wiki.teltonika-gps.com/view/FTC887_Teltonika_Data_Sending_Parameters_ID).

Los umbrales provisionales para la configuración del sensor en pruebas son **35° para abrir** y **30° para cerrar**, usando el valor absoluto del ángulo. Entre ambos se mantiene el estado anterior. Se pueden ajustar en el entorno y reiniciar el servidor:

```env
TIPPER_RAISE_ANGLE_DEG=35
TIPPER_LOWER_ANGLE_DEG=30
```

Debe cumplirse `0 <= TIPPER_LOWER_ANGLE_DEG < TIPPER_RAISE_ANGLE_DEG <= 180`. Los avisos booleanos explícitos del gateway tienen prioridad sobre el ángulo. Esta integración usa el Roll del sensor 1; no mezcla sensores ni ejes distintos. Los umbrales deben concordar con la configuración del EYE y su montaje.

Cada ciclo aparece una sola vez, con inicio, fin y duración. Hasta recibir la bajada queda pendiente de cierre; las lecturas repetidas, ausentes o inválidas no lo cierran ni generan nuevas basculaciones. El ciclo pertenece al día de inicio, aunque termine al día siguiente. Se interpretan también las lecturas ya almacenadas, sin migrar ni reescribirlas.

Las lecturas **sin fix GPS** también generan jornadas y basculaciones. Si el inicio no tiene coordenadas válidas se muestra **Sin ubicación**, sin inventar una posición a partir de la lectura de cierre. La ruta solo utiliza puntos GPS válidos. `GET /api/fleet` incluye `tipper` (estado, ángulo cuando está disponible y hora de la última lectura que confirma el estado), independiente de `latestPosition`.

Errores relevantes:

- `401 INVALID_SIGNATURE`: secreto, firma, timestamp o nonce incorrectos.
- `400 INVALID_PAYLOAD`: el paquete no cumple el esquema esperado.
- `403 UNKNOWN_DEVICE`: el IMEI está pendiente o deshabilitado.
- `503 TRACKER_NOT_CONFIGURED`: falta `TRACKER_SHARED_SECRET`.

## Interfaz

- **Dashboard:** resumen ejecutivo de toda la flota activa, mapa compacto de últimas posiciones, métricas de actividad y búsqueda exclusiva por matrícula.
- **Mapa en vivo:** mapa operativo dedicado con selección de uno, varios o todos los vehículos activos. Actualiza cada 5 segundos y recupera del servidor el recorrido y los avisos de basculación de la **última hora**, también al recargar. Cada posición o aviso desaparece al cumplir una hora, sin borrar el histórico. Un inicio anterior a la ventana puede tener su fin dentro de ella.
- **Histórico:** filtro por matrícula y fechas; muestra matrícula, jornada, tiempo en movimiento y una carpeta desplegable de basculaciones. «Ver mapa» abre el recorrido de esa jornada, con inicio, última posición y basculaciones. La vista se actualiza cada 5 segundos mientras está abierta, incluida la jornada de hoy, marcada «En curso». El tiempo aumenta con los registros de movimiento recibidos del GPS; no es necesario esperar al cierre del día. El recorrido abierto también incorpora los puntos nuevos, conservando el zoom. Cada coordenada de una basculación sigue abriendo un mapa puntual.
- **Estado:** tabla operativa con matrícula, IMEI, autorización, conexión, fix GPS y última recepción.
- **Vehículos:** detección automática de nuevos IMEIs, alta individual, importación CSV, cambio de matrícula, aprobación, deshabilitación y reactivación dentro de la sesión privada. Durante cada cambio se muestra un loader hasta que todas las vistas quedan sincronizadas.

En ambos mapas, la línea es **azul en movimiento**, **ámbar en parada** y **gris discontinua si falta el dato de movimiento**. No se añaden marcadores de parada. El color corresponde al estado recibido al principio de cada intervalo; se interrumpe la línea si se pierde el GPS o pasan más de 15 minutos entre posiciones.

Las basculaciones tienen un aviso **verde de inicio** y otro **rojo de fin**, con su hora y posición propias. Si falta GPS en una lectura, solo esa fase aparece como **Sin ubicación**. El ciclo sigue perteneciendo a la jornada de inicio aunque termine al día siguiente.

En el histórico, **Exportar PDF** descarga una jornada y **Exportar tabla a PDF** descarga un único documento con las jornadas visibles según los filtros de matrícula y fechas (hasta 1.000 jornadas). La tabla incluye matrícula, jornada, fecha/hora y coordenadas de inicio y fin, y duración. Conserva las jornadas sin basculaciones y señala los cierres pendientes. Los datos se consultan de nuevo al generar el informe; las horas corresponden a Europe/Madrid.

El mapa usa Leaflet sobre cartografía OpenStreetMap con un tratamiento visual propio de Budisa.

## Endpoints

- `GET /health`: salud de la web/API.
- `POST /tracker`: recepción firmada desde Railway.
- `POST /auth/login`, `GET /auth/session`, `POST /auth/logout`: acceso y sesión privada.
- `GET /api/fleet`: estado actual agregado de todos los dispositivos.
- `GET /api/tracker`: posiciones GPS filtradas por `imei`, `from` y `to`.
- `GET /api/tracker/days`: tiempo en movimiento y basculaciones agrupados por matrícula y día. `pointCount` cuenta registros, `gpsPointCount` cuenta posiciones válidas; cada `tipEvents` incluye `timestamp`, `endAt`, `durationSeconds`, `status` (`active`/`completed`), coordenadas de inicio (`latitude`, `longitude`) y fin (`endLatitude`, `endLongitude`), o `null` si no había GPS válido en esa lectura.
- `GET /api/tracker/live`: última hora de vehículos habilitados, con `from`, `to`, `truncated` y `vehicles`. Cada vehículo tiene `points` con `movement` y `breakBefore`, y `markers` con `phase` (`start`/`end`), hora y coordenadas. El máximo es de 100.000 lecturas recientes; se indica en la interfaz si la vista es parcial.
- `POST /api/tracker/report`: recibe `{ "days": [{ "imei": "...", "date": "AAAA-MM-DD" }] }` y devuelve un PDF adjunto de esas jornadas. Requiere sesión y CSRF. Valida la selección, elimina duplicados y reconstruye los ciclos desde las lecturas almacenadas; no acepta eventos aportados por el navegador.
- `GET /api/tracker/route?imei=...&date=AAAA-MM-DD`: posiciones ordenadas del recorrido de un vehículo en una jornada de Madrid, incluidos los cambios de horario. Devuelve `points` con `movement` y `breakBefore`, y `truncated` (límite de 100.000 lecturas, indicado en la interfaz cuando se supera).
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
