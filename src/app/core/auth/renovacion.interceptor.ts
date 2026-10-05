import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { esEndpointPublicoDeAutenticacion, esUrlDeApi } from '../api/api-url';
import { YA_REINTENTADA } from '../api/contextos';
import { SesionService } from './sesion.service';

/**
 * Ante un 401 en una petición normal: renueva el token UNA vez (compartido entre peticiones
 * simultáneas), reintenta la petición original una sola vez y, si la renovación falla,
 * cierra la sesión y manda al login.
 */
export const renovacionInterceptor: HttpInterceptorFn = (req, next) => {
  const sesion = inject(SesionService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      const aplica =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        esUrlDeApi(req.url) &&
        !esEndpointPublicoDeAutenticacion(req.url) &&
        !req.context.get(YA_REINTENTADA);

      if (!aplica) return throwError(() => error);

      return sesion.refrescar().pipe(
        catchError(() => {
          sesion.limpiar();
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => error);
        }),
        switchMap(() => next(req.clone({ context: req.context.set(YA_REINTENTADA, true) }))),
      );
    }),
  );
};
