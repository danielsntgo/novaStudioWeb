import { environment } from '../../../environments/environment';

/** Raíz de la API según el entorno (vacío en desarrollo: se usa el proxy de ng serve). */
export const API_BASE = `${environment.apiUrl}/api`;

export function esUrlDeApi(url: string): boolean {
  return url.startsWith(`${API_BASE}/`) || url === API_BASE;
}

/** Endpoints de /api/autenticacion que NO llevan Bearer ni disparan renovación de token. */
export function esEndpointPublicoDeAutenticacion(url: string): boolean {
  return /\/api\/autenticacion\/(login|refrescar|logout)(\?|$)/.test(url);
}
