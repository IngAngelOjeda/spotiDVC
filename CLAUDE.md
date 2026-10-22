# Control de Spotify por voz

App web instalable (PWA) que escucha el micrófono, reconoce comandos de voz en español y controla la reproducción de Spotify a través de la Web API de Spotify (Spotify Connect).

**Plataformas objetivo:** Chrome en Android y Chrome o Edge en Windows. Es un único código: se abre desde el navegador y se instala como app ("Agregar a pantalla de inicio" en Android, "Instalar app" en Windows).

Como usa Spotify Connect, cualquier dispositivo puede controlar a cualquier otro. Por ejemplo, hablarle al teléfono para controlar el Spotify de la PC.

## Alcance

Comandos fijos, sin IA ni modelo de lenguaje:

| Acción         | Frases que lo disparan (después de la palabra de activación) |
| -------------- | ------------------------------------------------------------ |
| Reanudar       | "play", "reproducir", "dale", "seguir"                       |
| Pausar         | "pausa", "pausar", "parar", "stop"                           |
| Siguiente tema | "siguiente", "próxima", "próximo", "pasá"                    |
| Tema anterior  | "anterior", "atrás", "volvé"                                 |
| Subir volumen  | "subí", "más fuerte" (+10)                                   |
| Bajar volumen  | "bajá", "más bajo" (-10)                                     |

- **Palabra de activación:** "música". El comando se ejecuta solo si la frase empieza con la palabra de activación ("música siguiente", "música pausa"). Así no reacciona a conversaciones de la habitación.
- **Botones en pantalla** para las mismas acciones, como respaldo si la voz falla.
- **Fuera de alcance por ahora:** búsqueda de canciones o artistas, playlists, pedidos en lenguaje libre y escucha con la pantalla apagada (ver "Limitaciones").

## Stack

- **Vite + TypeScript**, sin framework (vanilla). La app es chica y no lo necesita.
- **PWA:** `vite-plugin-pwa` (manifest, íconos, service worker).
- **Reconocimiento de voz:** Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). Viene incluida en Chrome y Edge en las dos plataformas. Requiere internet, porque el navegador procesa el audio en sus servidores.
- **Spotify:** `fetch` directo contra `https://api.spotify.com/v1`, con autenticación Authorization Code + PKCE hecha en el navegador. Sin SDK ni backend.
- **Hosting:** GitHub Pages (gratis y con HTTPS, que es obligatorio para el micrófono y para la Redirect URI).

## Estructura

```
spotiDVC/
├── CLAUDE.md
├── README.md              # instalación, configuración y despliegue
├── package.json
├── vite.config.ts         # incluye vite-plugin-pwa y `base` para GitHub Pages
├── index.html
├── .env.example           # VITE_SPOTIFY_CLIENT_ID=, VITE_REDIRECT_URI=
├── public/icons/          # íconos de la PWA (192 y 512 px)
├── src/
│   ├── main.ts            # arranque y conexión entre módulos
│   ├── ui.ts              # botones, estado, tema actual, selector de dispositivo
│   ├── speech.ts          # Web Speech API: escuchar y reiniciar
│   ├── commands.ts        # texto → acción (función pura, sin I/O)
│   ├── auth.ts            # PKCE: login, callback, refresh, logout
│   ├── spotify.ts         # llamadas a la API y manejo de errores
│   ├── wakelock.ts        # mantener la pantalla encendida mientras escucha
│   └── style.css
├── tests/
│   ├── commands.test.ts
│   └── spotify.test.ts
└── .github/workflows/deploy.yml   # build y publicación en GitHub Pages
```

## Spotify: requisitos y restricciones

- **Premium obligatorio.** Los endpoints de control de reproducción devuelven `403 PREMIUM_REQUIRED` con cuentas gratis. Desde febrero de 2026, Premium es además requisito para que el dueño de la app de desarrollador use la Web API.
- **Modo desarrollo:** 1 Client ID por desarrollador y máximo 5 usuarios autorizados (se agregan en el Developer Dashboard). Es suficiente para uso personal.
- **App de desarrollador:** se crea en https://developer.spotify.com/dashboard eligiendo "Web API". Hay que registrar **dos** Redirect URIs:
  - Desarrollo: `http://127.0.0.1:5173/` (Spotify no acepta `localhost`; tiene que ser `127.0.0.1`. Correr Vite con `--host 127.0.0.1`).
  - Producción: `https://ingangelojeda.github.io/spotiDVC/`
- **PKCE sin secreto:** nunca usar, pedir ni guardar el Client Secret. El Client ID sí puede ir en el código del frontend.
- **Scopes mínimos:** `user-modify-playback-state user-read-playback-state`. No pedir más.
- **Tokens:** guardar access token, refresh token y vencimiento en `localStorage`. Refrescar automáticamente un minuto antes del vencimiento y ante un `401`. Si el refresh falla, volver a mostrar el botón de login.
- Spotify tiene que estar abierto en algún dispositivo. La API no reproduce audio, solo le da órdenes a Spotify Connect.

### Endpoints a usar

| Acción                                     | Método y ruta                                              |
| ------------------------------------------ | ---------------------------------------------------------- |
| Reanudar                                   | `PUT /me/player/play`                                      |
| Pausar                                     | `PUT /me/player/pause`                                     |
| Siguiente                                  | `POST /me/player/next`                                     |
| Anterior                                   | `POST /me/player/previous`                                 |
| Volumen                                    | `PUT /me/player/volume?volume_percent=N`                   |
| Estado actual (tema, volumen, dispositivo) | `GET /me/player`                                           |
| Dispositivos                               | `GET /me/player/devices`                                   |
| Transferir reproducción                    | `PUT /me/player` con `{"device_ids": [id], "play": false}` |

### Manejo de errores

- `404 NO_ACTIVE_DEVICE`: consultar `/me/player/devices`. Si hay un dispositivo disponible, transferir la reproducción (preferir el elegido en el selector y guardado en `localStorage`) y reintentar el comando una vez. Si no hay ninguno, mostrar "Abrí Spotify en algún dispositivo".
- `403 PREMIUM_REQUIRED`: avisar claramente que hace falta Premium y no reintentar.
- `403` en volumen: algunos dispositivos (sobre todo celulares) no permiten controlar el volumen por API. Avisar y seguir.
- `401`: refrescar el token y reintentar una vez.
- `429`: respetar el header `Retry-After`.
- Errores de red: avisar y seguir escuchando. La app nunca debe quedar trabada por un error de un comando.

## Reconocimiento de voz

- Configurar `lang = "es-US"` (español latinoamericano), `continuous = true`, `interimResults = false`. El idioma es configurable desde la UI.
- Usar solo resultados finales y revisar todas las alternativas (`maxAlternatives = 3`): ejecutar la primera que coincida con un comando.
- **Reinicio automático:** Chrome corta el reconocimiento solo, sobre todo en Android (por silencio o tiempo). En `onend`, si el usuario no lo apagó, volver a llamar `start()`. Ante `onerror` con `no-speech` o `aborted`, reiniciar; ante `not-allowed`, mostrar cómo dar permiso al micrófono y no reintentar.
- Normalizar el texto antes de interpretarlo: minúsculas y sin tildes, así "próxima", "proxima" y "Próxima" son lo mismo.
- **Debounce:** ignorar un comando repetido si llega menos de 1,5 s después del anterior.
- Un botón grande de "Escuchar / Dejar de escuchar" con indicador visual claro de cuando el micrófono está activo.
- Si el navegador no soporta `SpeechRecognition` (por ejemplo Firefox), mostrar un aviso y dejar funcionando los botones.

## Limitaciones conocidas (documentarlas en el README)

- **Android:** el navegador solo escucha con la app abierta en primer plano y la pantalla encendida. Usar la Screen Wake Lock API (`navigator.wakeLock.request("screen")`) mientras escucha, y volver a pedirlo en `visibilitychange`. Escuchar con la pantalla apagada requeriría una app nativa con un servicio en primer plano, que queda fuera de alcance.
- **Android:** cada reinicio del reconocimiento puede hacer un sonido corto del sistema. Es comportamiento de Chrome y no se puede desactivar desde la web.
- **Windows:** funciona con la pestaña o la app en segundo plano, siempre que no esté minimizada mucho tiempo, porque el navegador puede suspenderla.
- Requiere conexión a internet, tanto para la voz como para Spotify.

## Convenciones

- Código, nombres de variables y funciones en inglés. Textos de la UI, mensajes de error y documentación en español.
- `commands.ts` es una función pura (`parse(text: string): Command | null`) sin dependencias del navegador ni de red, para poder testearla fácil.
- Feedback visible por cada comando (texto grande y breve): `▶ Reanudado`, `⏸ Pausado`, `⏭ Siguiente`, `⏮ Anterior`, `🔊 Volumen 60%`, y errores en una línea clara.
- UI pensada primero para el celular: botones grandes, una sola columna, modo oscuro según el sistema.
- TypeScript en modo `strict`. Formatear y verificar con Prettier y ESLint.
- Nunca versionar `.env`.

## Tests

- `commands.test.ts`: cada frase de la tabla con y sin tildes, con y sin palabra de activación, y frases que no deben disparar nada.
- `spotify.test.ts`: mockear `fetch` y cubrir cada caso de "Manejo de errores", incluido el refresh de token.
- No hacer llamadas reales a Spotify en los tests.
- Usar Vitest.

## Comandos

```bash
npm install
npm run dev -- --host 127.0.0.1   # desarrollo en http://127.0.0.1:5173/
npm run build                     # build de producción
npm test                          # tests
```

Para probar en el celular durante el desarrollo, usar la versión publicada en GitHub Pages, porque el micrófono exige HTTPS.

## Orden de implementación sugerido

1. `commands.ts` + sus tests.
2. `auth.ts`: login PKCE, callback, guardado y refresh del token.
3. `spotify.ts`: los 4 comandos básicos, conectados a botones en la UI.
4. `speech.ts`: reconocimiento con reinicio automático, mostrando en pantalla lo que reconoce.
5. Unir voz y comandos, con debounce y feedback.
6. Volumen, selector y transferencia de dispositivo, y manejo completo de errores.
7. PWA (manifest, íconos, service worker) y Wake Lock.
8. Workflow de GitHub Pages y `README.md` con los pasos para crear la app en Spotify, publicarla e instalarla en Android y Windows.
