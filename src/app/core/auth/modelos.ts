/** Roles exactos definidos por el backend. */
export type Rol = 'Administrador' | 'Recepcionista';

/** Respuesta de login, refrescar y cambiar-contrasena (OpenAPI: RespuestaAcceso). */
export interface RespuestaAcceso {
  tokenAcceso: string;
  expiraUtc: string;
  segundosVigencia: number | string;
}

export interface UsuarioSesion {
  id: string | null;
  correo: string;
  /** Nombre para mostrar (derivado del correo si el token no trae nombre). */
  nombre: string;
  roles: string[];
  cambioContrasenaObligatorio: boolean;
}
