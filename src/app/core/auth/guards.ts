import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Rol } from './modelos';
import { SesionService } from './sesion.service';

/** Solo se aceptan rutas internas como destino de retorno (evita redirecciones abiertas). */
export function esRutaInternaSegura(ruta: string | null | undefined): ruta is string {
  return !!ruta && ruta.startsWith('/') && !ruta.startsWith('//') && !ruta.startsWith('/\\');
}

/** Exige sesión iniciada y sin cambio de contraseña pendiente. */
export const autenticadoGuard: CanActivateFn = (_ruta, estado) => {
  const sesion = inject(SesionService);
  const router = inject(Router);

  if (!sesion.autenticado()) {
    // Si el destino es el inicio no hace falta recordarlo: es a donde va por defecto.
    const queryParams = estado.url !== '/' && estado.url !== '/inicio' ? { returnUrl: estado.url } : {};
    return router.createUrlTree(['/login'], { queryParams });
  }
  if (sesion.cambioContrasenaObligatorio()) return router.createUrlTree(['/cambiar-contrasena']);
  return true;
};

/** Exige sesión iniciada, aunque tenga el cambio de contraseña pendiente (pantalla de cambio). */
export const sesionIniciadaGuard: CanActivateFn = () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  return sesion.autenticado() ? true : router.createUrlTree(['/login']);
};

/** Solo para quien NO tiene sesión (pantalla de login). */
export const invitadoGuard: CanActivateFn = () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  if (!sesion.autenticado()) return true;
  return router.createUrlTree([sesion.cambioContrasenaObligatorio() ? '/cambiar-contrasena' : '/']);
};

/** Restringe una ruta a ciertos roles. El backend sigue siendo la autoridad real. */
export const rolGuard =
  (...roles: Rol[]): CanActivateFn =>
  () => {
    const sesion = inject(SesionService);
    const router = inject(Router);
    return sesion.tieneRol(...roles) ? true : router.createUrlTree(['/acceso-denegado']);
  };
