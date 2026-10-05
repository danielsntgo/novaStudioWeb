/** Genera un JWT de mentira (sin firma válida) para pruebas. */
export function crearTokenFalso(carga: Record<string, unknown>): string {
  // Un JWT real codifica en UTF-8 y luego en base64url.
  const codificar = (objeto: unknown) => {
    const binario = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(objeto)));
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar(carga)}.firma`;
}

export function respuestaAcceso(carga: Record<string, unknown>) {
  return {
    tokenAcceso: crearTokenFalso(carga),
    expiraUtc: new Date(Date.now() + 15 * 60_000).toISOString(),
    segundosVigencia: 900,
  };
}

export const CARGA_ADMIN = { sub: 'u-1', email: 'ana.lopez@flexpos.com', role: 'Administrador' };
export const CARGA_RECEPCIONISTA = { sub: 'u-2', email: 'luis@flexpos.com', role: ['Recepcionista'] };
