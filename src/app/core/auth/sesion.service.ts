import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';
import { API_BASE } from '../api/api-url';
import { SILENCIAR_ERRORES } from '../api/contextos';
import { RespuestaAcceso, UsuarioSesion } from './modelos';
import { usuarioDesdeToken } from './jwt';

const SIN_NOTIFICAR = () => new HttpContext().set(SILENCIAR_ERRORES, true);

/**
 * Estado de la sesión del usuario.
 *
 * - El access token vive SOLO en memoria (nunca en localStorage/sessionStorage).
 * - El refresh token viaja en una cookie HttpOnly que este código no puede leer.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _tokenAcceso = signal<string | null>(null);
  private readonly _usuario = signal<UsuarioSesion | null>(null);
  private refrescoEnCurso: Observable<string> | null = null;

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._usuario() !== null);
  readonly cambioContrasenaObligatorio = computed(() => this._usuario()?.cambioContrasenaObligatorio ?? false);

  get tokenAcceso(): string | null {
    return this._tokenAcceso();
  }

  tieneRol(...roles: string[]): boolean {
    const del = this._usuario()?.roles ?? [];
    return roles.some((r) => del.includes(r));
  }

  /** Inicia sesión. Los errores (401, 400) los gestiona quien llama. */
  iniciarSesion(correo: string, contrasena: string): Observable<void> {
    return this.http
      .post<RespuestaAcceso>(`${API_BASE}/autenticacion/login`, { correo, contrasena }, { context: SIN_NOTIFICAR() })
      .pipe(
        tap((r) => this.aplicarAcceso(r)),
        map(() => void 0),
      );
  }

  /**
   * Renueva el access token usando la cookie del refresh token.
   * Si varias peticiones piden renovar a la vez, todas comparten UNA sola llamada.
   */
  refrescar(): Observable<string> {
    if (!this.refrescoEnCurso) {
      this.refrescoEnCurso = this.http
        .post<RespuestaAcceso>(`${API_BASE}/autenticacion/refrescar`, null, { context: SIN_NOTIFICAR() })
        .pipe(
          tap((r) => this.aplicarAcceso(r)),
          map((r) => r.tokenAcceso),
          finalize(() => {
            this.refrescoEnCurso = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refrescoEnCurso;
  }

  /** Al arrancar la app: intenta recuperar la sesión con la cookie. Nunca rechaza. */
  async restaurarSesion(): Promise<void> {
    try {
      await firstValueFrom(this.refrescar());
    } catch {
      this.limpiar();
    }
  }

  /** Cierra la sesión en el servidor (revoca el refresh token) y en memoria. */
  cerrarSesion(): Observable<void> {
    return this.http.post<void>(`${API_BASE}/autenticacion/logout`, null, { context: SIN_NOTIFICAR() }).pipe(
      catchError(() => of(void 0)),
      tap(() => this.limpiar()),
      map(() => void 0),
    );
  }

  cambiarContrasena(contrasenaActual: string, contrasenaNueva: string): Observable<void> {
    return this.http
      .post<RespuestaAcceso>(
        `${API_BASE}/autenticacion/cambiar-contrasena`,
        { contrasenaActual, contrasenaNueva },
        { context: SIN_NOTIFICAR() },
      )
      .pipe(
        tap((r) => this.aplicarAcceso(r)),
        // Tras cambiar la contraseña ya no puede quedar el indicador de cambio obligatorio.
        tap(() => {
          const actual = this._usuario();
          if (actual?.cambioContrasenaObligatorio) this._usuario.set({ ...actual, cambioContrasenaObligatorio: false });
        }),
        map(() => void 0),
      );
  }

  /** Lo usa el interceptor de errores si el backend rechaza una petición por cambio de contraseña pendiente. */
  marcarCambioContrasenaObligatorio(): void {
    const actual = this._usuario();
    if (actual && !actual.cambioContrasenaObligatorio) {
      this._usuario.set({ ...actual, cambioContrasenaObligatorio: true });
      void this.router.navigate(['/cambiar-contrasena']);
    }
  }

  /** Borra la sesión en memoria (no llama al servidor). */
  limpiar(): void {
    this._tokenAcceso.set(null);
    this._usuario.set(null);
  }

  private aplicarAcceso(respuesta: RespuestaAcceso): void {
    const usuario = usuarioDesdeToken(respuesta.tokenAcceso);
    if (!usuario) {
      this.limpiar();
      throw new Error('El servidor devolvió un token de acceso ilegible.');
    }
    this._tokenAcceso.set(respuesta.tokenAcceso);
    this._usuario.set(usuario);
  }
}
