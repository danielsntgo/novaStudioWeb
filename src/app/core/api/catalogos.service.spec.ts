import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CatalogosService } from './catalogos.service';

describe('CatalogosService', () => {
  let servicio: CatalogosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(CatalogosService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('devuelve solo los métodos de pago activos', () => {
    let resultado: unknown;
    servicio.metodosPago().subscribe((r) => (resultado = r));
    http.expectOne('/api/configuracion/metodos-pago').flush([
      { id: '1', nombre: 'Efectivo', activo: true },
      { id: '2', nombre: 'Viejo', activo: false },
    ]);
    expect(resultado).toEqual([{ id: '1', nombre: 'Efectivo', activo: true }]);
  });

  it('si el rol no tiene acceso (403) devuelve null en vez de fallar', () => {
    const resultados: unknown[] = [];
    servicio.metodosPago().subscribe((r) => resultados.push(r));
    servicio.impuestos().subscribe((r) => resultados.push(r));
    servicio.configuracion().subscribe((r) => resultados.push(r));
    servicio.empleados().subscribe((r) => resultados.push(r));
    servicio.productos().subscribe((r) => resultados.push(r));
    for (const url of ['/api/configuracion/metodos-pago', '/api/configuracion/impuestos', '/api/configuracion']) {
      http.expectOne((r) => r.url === url).flush(null, { status: 403, statusText: 'Forbidden' });
    }
    http.expectOne((r) => r.url === '/api/empleados').flush(null, { status: 403, statusText: 'Forbidden' });
    http.expectOne((r) => r.url === '/api/inventario/articulos').flush(null, { status: 403, statusText: 'Forbidden' });
    expect(resultados).toEqual([null, null, null, null, null]);
  });

  it('los productos se piden filtrando por tipo Producto y activos', () => {
    servicio.productos('shampoo').subscribe();
    const r = http.expectOne((x) => x.url === '/api/inventario/articulos');
    expect(r.request.params.get('tipo')).toBe('Producto');
    expect(r.request.params.get('activo')).toBe('true');
    expect(r.request.params.get('buscar')).toBe('shampoo');
    r.flush({ elementos: [], pagina: 1, tamanoPagina: 30, totalElementos: 0 });
  });

  it('si falla el catálogo de servicios devuelve una lista vacía', () => {
    let resultado: unknown;
    servicio.servicios().subscribe((r) => (resultado = r));
    http.expectOne((x) => x.url === '/api/servicios').flush(null, { status: 500, statusText: 'Error' });
    expect(resultado).toEqual([]);
  });
});
