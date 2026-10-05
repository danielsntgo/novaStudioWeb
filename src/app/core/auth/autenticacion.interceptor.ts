import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { esEndpointPublicoDeAutenticacion, esUrlDeApi } from '../api/api-url';
import { SesionService } from './sesion.service';

/** Añade a cada petición de la API lo que necesita para autenticarse. */
export const autenticacionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!esUrlDeApi(req.url)) return next(req);

  const sesion = inject(SesionService);
  const esAutenticacion = req.url.includes('/api/autenticacion/');
  const esPublico = esEndpointPublicoDeAutenticacion(req.url);
  const necesitaCabeceraCsrf = /\/api\/autenticacion\/(refrescar|logout)(\?|$)/.test(req.url);

  let cabeceras = req.headers;
  const token = sesion.tokenAcceso;

  // Bearer en todo menos login, refrescar y logout.
  if (token && !esPublico) cabeceras = cabeceras.set('Authorization', `Bearer ${token}`);

  // Cabecera anti-CSRF exigida por el backend en refrescar y logout.
  if (necesitaCabeceraCsrf) cabeceras = cabeceras.set('X-Requested-With', 'XMLHttpRequest');

  // La cookie del refresh token solo se envía/recibe en los endpoints de autenticación.
  return next(req.clone({ headers: cabeceras, withCredentials: req.withCredentials || esAutenticacion }));
};
