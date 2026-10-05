import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEsCo from '@angular/common/locales/es-CO';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { autenticacionInterceptor } from './core/auth/autenticacion.interceptor';
import { erroresInterceptor } from './core/auth/errores.interceptor';
import { renovacionInterceptor } from './core/auth/renovacion.interceptor';
import { SesionService } from './core/auth/sesion.service';
import { TituloPaginaStrategy } from './core/layout/titulo-pagina.strategy';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Orden: errores (más externo) → renovación de token → autenticación (más interno).
    provideHttpClient(withInterceptors([erroresInterceptor, renovacionInterceptor, autenticacionInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: TitleStrategy, useExisting: TituloPaginaStrategy },
    // Intenta recuperar la sesión (cookie del refresh token) antes de mostrar la aplicación.
    provideAppInitializer(() => inject(SesionService).restaurarSesion()),
  ],
};
