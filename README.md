# Budisa

Plataforma modular en Node.js, HTML, CSS y JavaScript puro para recibir telemetría desde una Raspberry con:

- Señales del sensor de imán: `bascula_subida`, `bascula_bajada`, `estado_estable`, `alerta`
- GPS asociado a cada evento
- MongoDB como persistencia
- Dashboard visual
- Histórico de eventos con filtros apilables
- Columnas reordenables por drag and drop
- Columnas visibles/ocultas con botones `x` y `+`
- Tracker GPS con mini historial de posiciones
- Selector de modo día/noche

## Estructura

- `server.js` arranque de la app
- `src/config` configuración y conexión a MongoDB
- `src/models` esquemas de Mongo
- `src/services` lógica de negocio
- `src/controllers` controladores HTTP
- `src/routes` rutas API y vistas
- `public` frontend estático

## Endpoints

- `POST /api/telemetry` recibe eventos desde la Raspberry
- `GET /api/summary` resumen general
- `GET /api/events?limit=20` histórico reciente
- `GET /api/events/search?limit=200` búsqueda y filtros del histórico
- `GET /api/trail/:deviceId?limit=100` recorrido GPS
- `GET /api/devices` listado de dispositivos
- `GET /api/insights` señales de alerta y cambios rápidos

## Ejemplo de payload

```json
{
  "eventId": "e6f0d7f7-4c6f-4e1f-b6ac-2d0db6ad1a9a",
  "truckId": "LAB001",
  "event": "bascula_bajada",
  "timestamp": "2026-06-19T10:15:22Z",
  "gpio": 17,
  "gpioState": 1,
  "reason": "GPIO17_HIGH_RECUPERADO",
  "thresholdSeconds": 10,
  "lat": null,
  "lon": null,
  "speed": null,
  "gpsTimestamp": null
}
```

## Compatibilidad con la Raspberry actual

La app Python de `sensorseñal` manda eventos con esta forma:

- `eventId`
- `truckId`
- `event`
- `timestamp`
- `gpio`
- `gpioState`
- `reason`
- `thresholdSeconds`
- `lat`, `lon`, `speed`, `gpsTimestamp` opcionales

La API de Budisa acepta ese formato directamente y también sigue aceptando una versión simplificada con `deviceId` y `signal`.

## Arranque

1. Instalar dependencias: `npm install`
2. Crear `.env` a partir de `.env.example`
3. Levantar MongoDB local o remoto
4. Ejecutar `npm run dev`

## Ideas extra que ya deja preparada la base

- Exportación CSV
- Alertas por señales rápidas
- Estados por dispositivo
- Última posición y última señal
- Histórico ampliable a filtros por fechas
