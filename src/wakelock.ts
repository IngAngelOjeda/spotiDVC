// Mantiene la pantalla encendida mientras la app escucha (en Android, sin pantalla no hay micrófono).
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function request(): Promise<void> {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Batería baja u otra restricción del sistema: se sigue sin wake lock.
  }
}

// El navegador suelta el wake lock al ocultar la pestaña: volver a pedirlo al regresar.
document.addEventListener('visibilitychange', () => {
  if (wanted && !sentinel && document.visibilityState === 'visible') void request();
});

export function keepScreenOn(on: boolean): void {
  wanted = on;
  if (on) {
    if (!sentinel) void request();
  } else {
    void sentinel?.release();
    sentinel = null;
  }
}
