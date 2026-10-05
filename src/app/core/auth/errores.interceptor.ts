import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { esUrlDeApi } from '../api/api-url';
import { SILENCIAR_ERRORES } from '../api/contextos';
import { leerProblema } from '../api/problema';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { SesionService } from './sesion.service';

/**
 * Notificación global de errores de la API. No avisa de 400 ni de 401 (los gestiona cada
 * pantalla o el interceptor de renovación) ni de las peticiones marcadas con SILENCIAR_ERRORES.
 */
export const erroresInterceptor: HttpInterceptorFn = (req, next) => {
  const notificaciones = inject(NotificacionesService);
  const sesion = inject(SesionService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && esUrlDeApi(req.url) && !req.context.get(SILENCIAR_ERRORES)) {
        const problema = leerProblema(error);

        // El backend rechaza los tokens con cambio de contraseña pendiente: llevar a esa pantalla.
        const pideCambioContrasena =
          error.status === 403 && /contrase[nñ]a/i.test(`${problema.titulo} ${problema.detalle ?? ''} ${problema.codigo ?? ''}`);

        if (pideCambioContrasena) {
          sesion.marcarCambioContrasenaObligatorio();
        } else if (error.status !== 400 && error.status !== 401) {
          notificaciones.error(problema.detalle ?? problema.titulo);
        }
      }
      return throwError(() => error);
    }),
  );
};
