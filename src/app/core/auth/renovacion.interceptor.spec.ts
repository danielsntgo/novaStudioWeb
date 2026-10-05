import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CARGA_ADMIN, respuestaAcceso } from '../../../testing/token-falso';
import { autenticacionInterceptor } from './autenticacion.interceptor';
import { renovacionInterceptor } from './renovacion.interceptor';
import { SesionService } from './sesion.service';

describe('renovacionInterceptor', () => {
  let http: HttpClient;
  let controlador: HttpTestingController;
  let sesion: SesionService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([renovacionInterceptor, autenticacionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controlador = TestBed.inject(HttpTestingController);
    sesion = TestBed.inject(SesionService);
    router = TestBed.inject(Router);

    // Sesión iniciada con un token inicial.
    sesion.iniciarSesion('a@b.com', 'x').subscribe();
    controlador.expectOne('/api/autenticacion/login').flush(respuestaAcceso({ ...CARGA_ADMIN, jti: 'inicial' }));
  });

  afterEach(() => controlador.verify());

  it('envía el Bearer en peticiones normales', () => {
    http.get('/api/clientes').subscribe();
    const peticion = controlador.expectOne('/api/clientes');
    expect(peticion.request.headers.get('Authorization')).toBe(`Bearer ${sesion.tokenAcceso}`);
    peticion.flush({});
  });

  it('ante un 401 renueva el token y reintenta con el token nuevo', () => {
    const tokenViejo = sesion.tokenAcceso;
    let resultado: unknown;
    http.get('/api/clientes').subscribe((r) => (resultado = r));

    controlador.expectOne('/api/clientes').flush(null, { status: 401, statusText: 'Unauthorized' });
    controlador.expectOne('/api/autenticacion/refrescar').flush(respuestaAcceso({ ...CARGA_ADMIN, jti: 'nuevo' }));

    const reintento = controlador.expectOne('/api/clientes');
    expect(sesion.tokenAcceso).not.toBe(tokenViejo);
    expect(reintento.request.headers.get('Authorization')).toBe(`Bearer ${sesion.tokenAcceso}`);
    reintento.flush({ ok: true });

    expect(resultado).toEqual({ ok: true });
  });

  it('varias peticiones con 401 a la vez provocan UNA sola renovación', () => {
    const resultados: unknown[] = [];
    http.get('/api/clientes').subscribe((r) => resultados.push(r));
    http.get('/api/servicios').subscribe((r) => resultados.push(r));
    http.get('/api/citas').subscribe((r) => resultados.push(r));

    for (const ruta of ['/api/clientes', '/api/servicios', '/api/citas']) {
      controlador.expectOne(ruta).flush(null, { status: 401, statusText: 'Unauthorized' });
    }
    controlador.expectOne('/api/autenticacion/refrescar').flush(respuestaAcceso({ ...CARGA_ADMIN, jti: 'nuevo' }));

    for (const ruta of ['/api/clientes', '/api/servicios', '/api/citas']) {
      controlador.expectOne(ruta).flush({ ruta });
    }
    expect(resultados).toHaveLength(3);
  });

  it('si la renovación falla, cierra la sesión y manda al login', () => {
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    let error: { status?: number } | undefined;
    http.get('/api/clientes').subscribe({ error: (e) => (error = e) });

    controlador.expectOne('/api/clientes').flush(null, { status: 401, statusText: 'Unauthorized' });
    controlador.expectOne('/api/autenticacion/refrescar').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(error?.status).toBe(401);
    expect(sesion.autenticado()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('no entra en bucle: si el reintento también da 401, devuelve el error', () => {
    let error: { status?: number } | undefined;
    http.get('/api/clientes').subscribe({ error: (e) => (error = e) });

    controlador.expectOne('/api/clientes').flush(null, { status: 401, statusText: 'Unauthorized' });
    controlador.expectOne('/api/autenticacion/refrescar').flush(respuestaAcceso(CARGA_ADMIN));
    controlador.expectOne('/api/clientes').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(error?.status).toBe(401);
    controlador.expectNone('/api/autenticacion/refrescar');
  });

  it('un 401 en login no intenta renovar (credenciales incorrectas)', () => {
    let error: { status?: number } | undefined;
    http.post('/api/autenticacion/login', {}).subscribe({ error: (e) => (error = e) });
    controlador.expectOne('/api/autenticacion/login').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(error?.status).toBe(401);
  });

  it('no toca peticiones que no son de la API', () => {
    http.get('https://otro-sitio.com/datos').subscribe();
    const peticion = controlador.expectOne('https://otro-sitio.com/datos');
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush({});
  });
});
