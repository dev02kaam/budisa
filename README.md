# Budisa

Plataforma modular en Node.js, HTML, CSS y JavaScript puro para recibir telemetria desde una Raspberry con:

- Señales del sensor de iman: `bascula_subida`, `bascula_bajada`, `estado_estable`, `alerta`
- GPS asociado a cada evento
- MongoDB como persistencia
- Dashboard visual
- Historico de eventos con filtros apilables
- Columnas reordenables por drag and drop
- Columnas visibles/ocultas con botones `x` y `+`
- Tracker GPS con mini historial de posiciones
- Selector de modo dia/noche

## Estructura

- `server.js` arranque de la app
- `src/config` configuracion y conexion a MongoDB
- `src/models` esquemas de Mongo
- `src/services` logica de negocio
- `src/controllers` handlers HTTP
- `src/routes` rutas API y vistas
- `public` frontend estatico

## Endpoints

- `POST /api/telemetry` recibe eventos desde la Raspberry
- `GET /api/summary` resumen general
- `GET /api/events?limit=20` historico reciente
- `GET /api/events/search?limit=200` busqueda y filtros del historico
- `GET /api/trail/:deviceId?limit=100` recorrido GPS
- `GET /api/devices` listado de dispositivos
- `GET /api/insights` señales de alerta y cambios rapidos

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

La API de Budisa acepta ese formato directamente y tambien sigue aceptando una version simplificada con `deviceId` y `signal`.

## Arranque

1. Instalar dependencias: `npm install`
2. Crear `.env` a partir de `.env.example`
3. Levantar MongoDB local o remoto
4. Ejecutar `npm run dev`

## Ideas extra que ya deja preparada la base

- Exportacion CSV
- Alertas por señales rapidas
- Estados por dispositivo
- Ultima posicion y ultima señal
- Historial ampliable a filtros por fechas
