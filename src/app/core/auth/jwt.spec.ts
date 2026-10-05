import { CARGA_ADMIN, CARGA_RECEPCIONISTA, crearTokenFalso } from '../../../testing/token-falso';
import { decodificarJwt, usuarioDesdeToken } from './jwt';

describe('jwt', () => {
  it('lee id, correo, nombre derivado y rol (cadena)', () => {
    const usuario = usuarioDesdeToken(crearTokenFalso(CARGA_ADMIN));
    expect(usuario).toEqual({
      id: 'u-1',
      correo: 'ana.lopez@flexpos.com',
      nombre: 'Ana Lopez',
      roles: ['Administrador'],
      cambioContrasenaObligatorio: false,
    });
  });

  it('acepta el rol como lista y como URI larga de .NET', () => {
    expect(usuarioDesdeToken(crearTokenFalso(CARGA_RECEPCIONISTA))?.roles).toEqual(['Recepcionista']);
    const larga = crearTokenFalso({
      email: 'a@b.com',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': ['Administrador'],
    });
    expect(usuarioDesdeToken(larga)?.roles).toEqual(['Administrador']);
  });

  it('usa el claim de nombre cuando existe', () => {
    const usuario = usuarioDesdeToken(crearTokenFalso({ ...CARGA_ADMIN, given_name: 'Ana María' }));
    expect(usuario?.nombre).toBe('Ana María');
  });

  it('detecta un claim de cambio de contraseña obligatorio', () => {
    const token = crearTokenFalso({ ...CARGA_ADMIN, cambio_contrasena_obligatorio: 'true' });
    expect(usuarioDesdeToken(token)?.cambioContrasenaObligatorio).toBe(true);
    const falso = crearTokenFalso({ ...CARGA_ADMIN, cambio_contrasena_obligatorio: 'false' });
    expect(usuarioDesdeToken(falso)?.cambioContrasenaObligatorio).toBe(false);
  });

  it('devuelve null con un token ilegible', () => {
    expect(decodificarJwt('no-es-un-jwt')).toBeNull();
    expect(usuarioDesdeToken('a.b.c')).toBeNull();
  });
});
