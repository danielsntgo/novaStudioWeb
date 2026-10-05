import { HttpErrorResponse } from '@angular/common/http';

/** Forma normalizada de un error de la API (ProblemDetails de ASP.NET Core). */
export interface ProblemaApi {
  /** Código HTTP (0 si no hubo respuesta del servidor). */
  estado: number;
  /** Código de negocio extraído de `type` (por ejemplo `cita.solapamiento`), si existe. */
  codigo?: string;
  titulo: string;
  detalle?: string;
  /** Errores de validación por campo (solo en 400 de model binding). */
  errores?: Record<string, string[]>;
}

const PREFIJO_ERROR = 'urn:flexpos:error:';

const MENSAJES_POR_ESTADO: Record<number, string> = {
  0: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  400: 'Los datos enviados no son válidos.',
  401: 'Tu sesión ya no es válida. Inicia sesión de nuevo.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No se encontró lo que buscabas.',
  409: 'La operación no se pudo completar por un conflicto con el estado actual.',
};

/** Convierte cualquier error de HttpClient en un objeto uniforme y con mensaje en español. */
export function leerProblema(error: unknown): ProblemaApi {
  if (!(error instanceof HttpErrorResponse)) {
    return { estado: 0, titulo: MENSAJES_POR_ESTADO[0] };
  }

  const cuerpo = typeof error.error === 'object' && error.error !== null ? (error.error as Record<string, unknown>) : null;
  const tipo = typeof cuerpo?.['type'] === 'string' ? (cuerpo['type'] as string) : undefined;
  const titulo = typeof cuerpo?.['title'] === 'string' ? (cuerpo['title'] as string) : undefined;
  const detalle = typeof cuerpo?.['detail'] === 'string' ? (cuerpo['detail'] as string) : undefined;
  const errores = cuerpo?.['errors'] && typeof cuerpo['errors'] === 'object'
    ? (cuerpo['errors'] as Record<string, string[]>)
    : undefined;

  const genericoEstado = MENSAJES_POR_ESTADO[error.status];
  const esServidor = error.status >= 500;

  return {
    estado: error.status,
    codigo: tipo?.startsWith(PREFIJO_ERROR) ? tipo.slice(PREFIJO_ERROR.length) : undefined,
    // Los errores de dominio traen el mensaje en español en `title`; los 5xx se ocultan a propósito.
    titulo: esServidor ? 'Ocurrió un error en el servidor. Inténtalo de nuevo en unos minutos.' : (titulo ?? genericoEstado ?? 'Ocurrió un error inesperado.'),
    detalle: esServidor ? undefined : detalle,
    errores,
  };
}

/** Mensaje listo para mostrar al usuario. */
export function mensajeDeError(error: unknown, porDefecto?: string): string {
  const problema = leerProblema(error);
  const primerErrorDeCampo = problema.errores ? Object.values(problema.errores).flat()[0] : undefined;
  return primerErrorDeCampo ?? problema.detalle ?? problema.titulo ?? porDefecto ?? 'Ocurrió un error inesperado.';
}
