# spotiDVC

Aplicación web para controlar Spotify con la voz, en español. Funciona en Chrome para Android y en Chrome o Edge para Windows, y se puede instalar como una app.

Usa Spotify Connect: podés hablarle al celular para controlar el Spotify de la PC, o al revés.

Versión publicada: https://ingangelojeda.github.io/spotiDVC/

## Qué necesitás

- Una cuenta de **Spotify Premium**. Sin Premium, Spotify no permite controlar la reproducción desde otras aplicaciones.
- **Node.js 20 o superior** (incluye `npm`). Se descarga de https://nodejs.org
- **Git** y una cuenta de **GitHub**, solo si la vas a publicar.
- **Chrome o Edge** y un micrófono.
- Conexión a internet.

## Paso 1. Crear la app en el panel de Spotify

1. Entrá a https://developer.spotify.com/dashboard e iniciá sesión con tu cuenta de Spotify.
2. Tocá **Create app**.
3. Completá el formulario:
   - **App name:** `spotiDVC` (o el nombre que quieras).
   - **App description:** cualquier texto, por ejemplo "Control por voz".
   - **Redirect URIs:** agregá estas dos direcciones, una por vez, con el botón **Add**:
     ```
     http://127.0.0.1:5173/
     https://ingangelojeda.github.io/spotiDVC/
     ```
     Tienen que quedar escritas exactamente así, con la barra final. Spotify no acepta `localhost`: usá `127.0.0.1`.
   - **Which API/SDKs are you planning to use?:** marcá **Web API**.
4. Aceptá los términos y tocá **Save**.
5. En la página de la app, entrá a **Settings** y copiá el **Client ID**.

No uses el **Client Secret**. Esta aplicación no lo necesita y no debe guardarse en ningún archivo.

### Agregar a otras personas (opcional)

Las apps nuevas de Spotify quedan en modo desarrollo y solo las pueden usar las cuentas autorizadas, con un máximo de 5. Para sumar a alguien: **Settings**, pestaña **User Management**, cargá su nombre y el email de su cuenta de Spotify.

## Paso 2. Descargar el proyecto e instalar dependencias

Abrí una terminal y ejecutá:

```bash
git clone https://github.com/IngAngelOjeda/spotiDVC.git
cd spotiDVC
npm install
```

## Paso 3. Configurar el Client ID

1. Copiá el archivo de ejemplo:

   ```bash
   cp .env.example .env
   ```

   En Windows con PowerShell: `Copy-Item .env.example .env`

2. Abrí `.env` y pegá tu Client ID:

   ```
   VITE_SPOTIFY_CLIENT_ID=tu_client_id
   VITE_REDIRECT_URI=
   ```

   `VITE_REDIRECT_URI` puede quedar vacío: la app usa la dirección desde donde se abre.

El archivo `.env` está en `.gitignore`, así que no se sube al repositorio.

## Paso 4. Levantar la app en la PC

```bash
npm run dev
```

Abrí http://127.0.0.1:5173/ en Chrome o Edge. Tiene que ser `127.0.0.1` y no `localhost`, porque esa es la dirección registrada en Spotify.

Si cambiás el `.env` con la app corriendo, el servidor se reinicia solo.

## Paso 5. Conectar tu cuenta de Spotify

1. Tocá **Conectar con Spotify**.
2. Spotify te muestra los permisos que pide la app (ver y controlar la reproducción). Tocá **Agree** o **Aceptar**.
3. Volvés a la app ya conectado. La sesión queda guardada en el navegador y se renueva sola.

## Paso 6. Usarla

1. Abrí Spotify en algún dispositivo: la app de escritorio, el celular o un parlante compatible. Esta aplicación no reproduce audio, le da órdenes a Spotify.
2. En **Controlar**, elegí el dispositivo que querés manejar. Si no aparece, tocá el botón de actualizar que está al lado.
3. Tocá el círculo grande del centro. La primera vez el navegador pide permiso para usar el micrófono: aceptalo.
4. Cuando el círculo late, te está escuchando. Decí la palabra **música** seguida del comando.
5. Para dejar de escuchar, tocá el círculo otra vez.

Debajo del círculo se ve lo que entendió y lo que hizo. Los botones de la pantalla hacen lo mismo que los comandos de voz.

### Comandos

Toda frase tiene que empezar con **música**. Así la app no reacciona a las conversaciones de la habitación.

| Decí "música" y después...        | Qué hace           |
| --------------------------------- | ------------------ |
| play, reproducir, dale, seguir    | Reanuda            |
| pausa, pausar, parar, stop        | Pausa              |
| siguiente, próxima, próximo, pasá | Pasa al siguiente  |
| anterior, atrás, volvé            | Vuelve al anterior |
| subí, más fuerte                  | Sube el volumen 10 |
| bajá, más bajo                    | Baja el volumen 10 |

Ejemplos: "música siguiente", "música pausa", "música más fuerte".

### Ajustes

El botón de engranaje, arriba a la derecha, permite cambiar el idioma del reconocimiento (Latinoamérica, Argentina, México o España) y desconectar la cuenta de Spotify.

## Paso 7. Publicarla en GitHub Pages

Para usarla desde el celular hace falta publicarla, porque el micrófono solo funciona con HTTPS.

1. Subí el proyecto a tu repositorio de GitHub.
2. En el repositorio, entrá a **Settings**, después a **Pages**, y en **Source** elegí **GitHub Actions**.
3. Entrá a **Settings**, **Secrets and variables**, **Actions**, pestaña **Variables**, y tocá **New repository variable**:
   - **Name:** `SPOTIFY_CLIENT_ID`
   - **Value:** tu Client ID
4. Hacé un push a la rama `main`. El workflow `.github/workflows/deploy.yml` corre los tests, compila la app y la publica.
5. Seguí el progreso en la pestaña **Actions**. Cuando termine, la app queda en https://ingangelojeda.github.io/spotiDVC/

Si publicás desde otro usuario o con otro nombre de repositorio, cambiá `base` en `vite.config.ts` y registrá la dirección nueva como Redirect URI en Spotify.

## Paso 8. Instalarla como app

**Android (Chrome):**

1. Abrí la dirección publicada.
2. Tocá el menú de tres puntos.
3. Elegí **Agregar a pantalla de inicio** o **Instalar app**.

**Windows (Chrome o Edge):**

1. Abrí la dirección publicada.
2. Tocá el ícono de instalar que aparece a la derecha de la barra de direcciones.
3. Confirmá con **Instalar**.

## Problemas comunes

| Mensaje o síntoma                             | Qué hacer                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_CLIENT: Invalid redirect URI`        | La dirección desde la que abriste la app no está en las Redirect URIs de Spotify. Revisá el Paso 1 y usá `127.0.0.1`, no `localhost`. |
| "Falta configurar VITE_SPOTIFY_CLIENT_ID"     | El `.env` no tiene el Client ID. Revisá el Paso 3.                                                                                    |
| "Hace falta Spotify Premium"                  | La cuenta conectada no es Premium.                                                                                                    |
| "Abrí Spotify en algún dispositivo"           | No hay ningún Spotify abierto con tu cuenta. Abrilo y tocá actualizar en **Controlar**.                                               |
| "Este dispositivo no deja cambiar el volumen" | Algunos dispositivos, sobre todo celulares, no permiten cambiar el volumen desde otra app. El resto de los comandos funciona.         |
| No pide el micrófono o no escucha             | Tocá el candado de la barra de direcciones, buscá **Micrófono**, elegí **Permitir** y recargá la página.                              |
| Error 403 al conectar la cuenta               | La cuenta no está autorizada en **User Management** de la app de Spotify.                                                             |
| Firefox no escucha                            | Firefox no tiene reconocimiento de voz. Usá Chrome o Edge, o los botones.                                                             |

## Limitaciones

- **Android:** solo escucha con la app abierta y la pantalla encendida. Mientras escucha, la app evita que la pantalla se apague sola. Escuchar con la pantalla apagada requeriría una app nativa.
- **Android:** cada vez que el reconocimiento se reinicia, el sistema puede hacer un sonido corto. Es comportamiento de Chrome y no se puede desactivar desde una página web.
- **Windows:** funciona con la pestaña o la app en segundo plano, pero si queda minimizada mucho tiempo el navegador puede suspenderla.
- Necesita internet: el reconocimiento de voz del navegador funciona en la nube.

## Para desarrolladores

```bash
npm run dev       # servidor de desarrollo en http://127.0.0.1:5173/
npm test          # tests con Vitest
npm run lint      # ESLint
npm run format    # Prettier
npm run build     # build de producción en dist/
npm run preview   # sirve el build localmente
npm run icons     # regenera los íconos de public/icons/
```

Los detalles de arquitectura, convenciones y manejo de errores están en `CLAUDE.md`.
