import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CARGA_ADMIN, respuestaAcceso } from '../../../testing/token-falso';
import { autenticacionInterceptor } from './autenticacion.interceptor';
import { SesionService } from './sesion.service';

describe('SesionService', () => {
  let sesion: SesionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    sesion = TestBed.inject(SesionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('inicia sesión: guarda usuario y token en memoria', () => {
    let terminado = false;
    sesion.iniciarSesion('ana.lopez@flexpos.com', 'secreta').subscribe(() => (terminado = true));

    const peticion = http.expectOne('/api/autenticacion/login');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ correo: 'ana.lopez@flexpos.com', contrasena: 'secreta' });
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    expect(peticion.request.withCredentials).toBe(true);
    peticion.flush(respuestaAcceso(CARGA_ADMIN));

    expect(terminado).toBe(true);
    expect(sesion.autenticado()).toBe(true);
    expect(sesion.tieneRol('Administrador')).toBe(true);
    expect(sesion.tokenAcceso).toBeTruthy();
  });

  it('no guarda el token en el almacenamiento del navegador', () => {
    sesion.iniciarSesion('a@b.com', 'x').subscribe();
    http.expectOne('/api/autenticacion/login').flush(respuestaAcceso(CARGA_ADMIN));

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('credenciales incorrectas: no hay sesión y el error llega a quien llama', () => {
    let estado = 0;
    sesion.iniciarSesion('a@b.com', 'mala').subscribe({ error: (e) => (estado = e.status) });
    http.expectOne('/api/autenticacion/login').flush({ title: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });

    expect(estado).toBe(401);
    expect(sesion.autenticado()).toBe(false);
  });

  it('refrescar envía la cabecera anti-CSRF y las credenciales, sin Bearer', () => {
    sesion.refrescar().subscribe();
    const peticion = http.expectOne('/api/autenticacion/refrescar');
    expect(peticion.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(peticion.request.withCredentials).toBe(true);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush(respuestaAcceso(CARGA_ADMIN));
  });

  it('varias renovaciones simultáneas comparten una sola llamada', () => {
    const tokens: string[] = [];
    sesion.refrescar().subscribe((t) => tokens.push(t));
    sesion.refrescar().subscribe((t) => tokens.push(t));
    sesion.refrescar().subscribe((t) => tokens.push(t));

    http.expectOne('/api/autenticacion/refrescar').flush(respuestaAcceso(CARGA_ADMIN));
    expect(tokens).toHaveLength(3);
    expect(new Set(tokens).size).toBe(1);
  });

  it('restaurarSesion con cookie inválida deja la sesión vacía y no falla', async () => {
    const promesa = sesion.restaurarSesion();
    http.expectOne('/api/autenticacion/refrescar').flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(promesa).resolves.toBeUndefined();
    expect(sesion.autenticado()).toBe(false);
  });

  it('restaurarSesion con cookie válida recupera la sesión', async () => {
    const promesa = sesion.restaurarSesion();
    http.expectOne('/api/autenticacion/refrescar').flush(respuestaAcceso(CARGA_ADMIN));
    await promesa;
    expect(sesion.autenticado()).toBe(true);
  });

  it('cerrarSesion llama al servidor con la cabecera anti-CSRF y limpia la sesión aunque falle', () => {
    sesion.iniciarSesion('a@b.com', 'x').subscribe();
    http.expectOne('/api/autenticacion/login').flush(respuestaAcceso(CARGA_ADMIN));

    sesion.cerrarSesion().subscribe();
    const peticion = http.expectOne('/api/autenticacion/logout');
    expect(peticion.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    peticion.flush(null, { status: 500, statusText: 'Error' });

    expect(sesion.autenticado()).toBe(false);
    expect(sesion.tokenAcceso).toBeNull();
  });

  it('cambiarContrasena actualiza el token y quita el indicador de cambio obligatorio', () => {
    sesion.iniciarSesion('a@b.com', 'x').subscribe();
    http
      .expectOne('/api/autenticacion/login')
      .flush(respuestaAcceso({ ...CARGA_ADMIN, cambio_contrasena_obligatorio: 'true' }));
    expect(sesion.cambioContrasenaObligatorio()).toBe(true);

    sesion.cambiarContrasena('temporal', 'NuevaClave#2026').subscribe();
    const peticion = http.expectOne('/api/autenticacion/cambiar-contrasena');
    expect(peticion.request.headers.get('Authorization')).toMatch(/^Bearer /);
    expect(peticion.request.body).toEqual({ contrasenaActual: 'temporal', contrasenaNueva: 'NuevaClave#2026' });
    peticion.flush(respuestaAcceso(CARGA_ADMIN));

    expect(sesion.cambioContrasenaObligatorio()).toBe(false);
  });
});
