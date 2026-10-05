import { UsuarioSesion } from './modelos';

type CargaJwt = Record<string, unknown>;

/**
 * Nombres de claims que se buscan en el JWT. El contrato del backend no los documenta, así que
 * se aceptan las variantes habituales de ASP.NET Core. Si el backend usa otros, se ajustan AQUÍ.
 */
const CLAIMS_ID = ['sub', 'nameid', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'];
const CLAIMS_CORREO = ['email', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress', 'unique_name', 'name'];
const CLAIMS_NOMBRE = ['nombre', 'given_name', 'name', 'unique_name'];
const CLAIMS_ROL = ['role', 'roles', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
const PATRON_CAMBIO_CONTRASENA =
  /(cambio|change|must|obligat|require).*(contrase|password|pwd)|(contrase|password|pwd).*(cambio|change|must|obligat|require)/i;

/** Lee la carga (payload) del JWT sin verificar la firma: es solo para mostrar datos en la interfaz. */
export function decodificarJwt(token: string): CargaJwt | null {
  try {
    const partes = token.split('.');
    if (partes.length !== 3) return null;
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(relleno), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as CargaJwt;
  } catch {
    return null;
  }
}

function primerTexto(carga: CargaJwt, claves: string[]): string | null {
  for (const clave of claves) {
    const valor = carga[clave];
    if (typeof valor === 'string' && valor.trim()) return valor;
  }
  return null;
}

function comoLista(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === 'string');
  return typeof valor === 'string' ? [valor] : [];
}

function esVerdadero(valor: unknown): boolean {
  return valor === true || (typeof valor === 'string' && valor.toLowerCase() === 'true');
}

function nombreDesdeCorreo(correo: string): string {
  const local = correo.split('@')[0] ?? correo;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/** Construye los datos de sesión a partir del access token. Devuelve null si el token no es legible. */
export function usuarioDesdeToken(token: string): UsuarioSesion | null {
  const carga = decodificarJwt(token);
  if (!carga) return null;

  let roles: string[] = [];
  for (const clave of CLAIMS_ROL) {
    roles = roles.concat(comoLista(carga[clave]));
  }

  const correo = primerTexto(carga, CLAIMS_CORREO) ?? '';
  const nombre = primerTexto(carga, CLAIMS_NOMBRE);
  const cambioObligatorio = Object.entries(carga).some(
    ([clave, valor]) => PATRON_CAMBIO_CONTRASENA.test(clave) && esVerdadero(valor),
  );

  return {
    id: primerTexto(carga, CLAIMS_ID),
    correo,
    nombre: nombre && !nombre.includes('@') ? nombre : nombreDesdeCorreo(correo || 'Usuario'),
    roles: [...new Set(roles)],
    cambioContrasenaObligatorio: cambioObligatorio,
  };
}
