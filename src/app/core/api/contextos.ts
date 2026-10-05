import { HttpContextToken } from '@angular/common/http';

/** Si es true, el interceptor de errores no muestra notificación (el llamador gestiona el error). */
export const SILENCIAR_ERRORES = new HttpContextToken<boolean>(() => false);

/** Marca una petición que ya se reintentó tras renovar el token, para evitar bucles. */
export const YA_REINTENTADA = new HttpContextToken<boolean>(() => false);
