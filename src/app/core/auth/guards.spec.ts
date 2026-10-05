import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { autenticadoGuard, esRutaInternaSegura, invitadoGuard, rolGuard, sesionIniciadaGuard } from './guards';
import { SesionService } from './sesion.service';

function sesionFalsa(estado: { autenticado: boolean; cambio?: boolean; roles?: string[] }) {
  return {
    autenticado: signal(estado.autenticado),
    cambioContrasenaObligatorio: signal(estado.cambio ?? false),
    tieneRol: (...roles: string[]) => roles.some((r) => (estado.roles ?? []).includes(r)),
  };
}

function ejecutar(guard: Function, estado: Parameters<typeof sesionFalsa>[0], url = '/clientes') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SesionService, useValue: sesionFalsa(estado) }],
  });
  const resultado = TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
  return { resultado, router: TestBed.inject(Router) };
}

describe('guards', () => {
  it('autenticadoGuard: sin sesión redirige al login conservando el destino', () => {
    const { resultado, router } = ejecutar(autenticadoGuard, { autenticado: false }, '/clientes');
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login?returnUrl=%2Fclientes');
  });

  it('autenticadoGuard: con cambio de contraseña pendiente redirige a cambiar-contrasena', () => {
    const { resultado, router } = ejecutar(autenticadoGuard, { autenticado: true, cambio: true });
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/cambiar-contrasena');
  });

  it('autenticadoGuard: con sesión normal deja pasar', () => {
    expect(ejecutar(autenticadoGuard, { autenticado: true }).resultado).toBe(true);
  });

  it('sesionIniciadaGuard: deja pasar con sesión (aunque tenga cambio pendiente)', () => {
    expect(ejecutar(sesionIniciadaGuard, { autenticado: true, cambio: true }).resultado).toBe(true);
  });

  it('invitadoGuard: con sesión no permite ver el login', () => {
    const { resultado, router } = ejecutar(invitadoGuard, { autenticado: true });
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/');
    expect(ejecutar(invitadoGuard, { autenticado: false }).resultado).toBe(true);
  });

  it('rolGuard: permite el rol correcto y niega los demás', () => {
    expect(ejecutar(rolGuard('Administrador'), { autenticado: true, roles: ['Administrador'] }).resultado).toBe(true);
    const { resultado, router } = ejecutar(rolGuard('Administrador'), { autenticado: true, roles: ['Recepcionista'] });
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/acceso-denegado');
  });

  it('esRutaInternaSegura rechaza destinos externos', () => {
    expect(esRutaInternaSegura('/clientes?x=1')).toBe(true);
    expect(esRutaInternaSegura('//malo.com')).toBe(false);
    expect(esRutaInternaSegura('https://malo.com')).toBe(false);
    expect(esRutaInternaSegura(null)).toBe(false);
  });
});
