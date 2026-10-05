/**
 * Zona horaria del negocio. El backend guarda y devuelve UTC; la interfaz muestra y envía
 * en esta zona. Colombia no tiene horario de verano, por eso el desfase es fijo.
 * Si el negocio cambia de zona, se ajusta AQUÍ (y cuando exista, desde Configuración).
 */
export const ZONA_HORARIA = 'America/Bogota';
export const DESFASE_ZONA = '-05:00';

const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtFechaCorta = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, day: 'numeric', month: 'short', year: 'numeric' });
const fmtFechaHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** yyyy-MM-dd de un instante, en la zona del negocio. */
export function fechaLocalDe(instante: string | Date): string {
  return fmtFecha.format(new Date(instante));
}

/** HH:mm de un instante, en la zona del negocio. */
export function horaLocalDe(instante: string | Date): string {
  return fmtHora.format(new Date(instante));
}

export function hoyLocal(): string {
  return fechaLocalDe(new Date());
}

/** Combina fecha (yyyy-MM-dd) y hora (HH:mm) en ISO 8601 con desfase, como pide la API. */
export function aIsoConDesfase(fecha: string, hora: string): string {
  return `${fecha}T${hora.slice(0, 5)}:00${DESFASE_ZONA}`;
}

/** Instante UTC (ISO) en que empieza el día local indicado. */
export function inicioDiaUtc(fecha: string): string {
  return new Date(`${fecha}T00:00:00${DESFASE_ZONA}`).toISOString();
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Lunes de la semana a la que pertenece la fecha. */
export function lunesDe(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((diaSemana + 6) % 7));
}

/** "domingo, 4 de octubre" a partir de yyyy-MM-dd (sin desplazamientos de zona). */
export function etiquetaFecha(fecha: string, conAnio = false): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const texto = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(conAnio ? { year: 'numeric' } : {}),
  }).format(new Date(Date.UTC(a, m - 1, d)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatearFecha(instante: string | null | undefined): string {
  return instante ? fmtFechaCorta.format(new Date(instante)) : '—';
}

export function formatearFechaHora(instante: string | null | undefined): string {
  return instante ? fmtFechaHora.format(new Date(instante)) : '—';
}

/** Minutos desde medianoche local de una hora "HH:mm". */
export function minutosDe(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

export function horaDeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
