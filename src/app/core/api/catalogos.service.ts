import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { SILENCIAR_ERRORES } from './contextos';
import { normalizarPagina, parametros } from './paginas';

export interface MetodoPagoOpcion {
  id: string;
  nombre: string;
  requiereReferencia: boolean;
  esEfectivo: boolean;
  activo: boolean;
}
export interface ImpuestoOpcion {
  id: string;
  nombre: string;
  porcentaje: number | string;
  activo: boolean;
}
export interface EmpleadoOpcion {
  id: string;
  nombre: string;
  cargo?: string;
}
export interface ServicioCatalogo {
  id: string;
  nombre: string;
  categoria?: string | null;
  precio: number | string;
  codigoMoneda: string;
  duracionMinutos: number | string;
}
export interface ArticuloCatalogo {
  id: string;
  codigo?: string | null;
  nombre: string;
  tipo: string;
  unidadBase: string;
  manejaFraccion: boolean;
  existenciaActual: number | string;
  precioVenta?: number | string | null;
  codigoMoneda: string;
}
export interface ConfiguracionVenta {
  codigoMoneda: string;
  permitirVentaSinStock: boolean;
  permitirSaldosPendientes: boolean;
  facturacionHabilitada: boolean;
  exigirEmpleadoVentaServicio: boolean;
}

const SILENCIO = () => ({ context: new HttpContext().set(SILENCIAR_ERRORES, true) });

/**
 * Listas de apoyo para formularios (métodos de pago, impuestos, empleados, catálogos).
 * Si el rol no tiene acceso a una lista (403), devuelven `null` en lugar de fallar: así cada
 * pantalla puede explicar qué falta en vez de mostrar un error técnico.
 */
@Injectable({ providedIn: 'root' })
export class CatalogosService {
  private readonly http = inject(HttpClient);

  metodosPago(): Observable<MetodoPagoOpcion[] | null> {
    return this.http.get<MetodoPagoOpcion[]>('/api/configuracion/metodos-pago', SILENCIO()).pipe(
      map((lista) => lista.filter((m) => m.activo)),
      catchError(() => of(null)),
    );
  }

  impuestos(): Observable<ImpuestoOpcion[] | null> {
    return this.http.get<ImpuestoOpcion[]>('/api/configuracion/impuestos', SILENCIO()).pipe(
      map((lista) => lista.filter((i) => i.activo)),
      catchError(() => of(null)),
    );
  }

  configuracion(): Observable<ConfiguracionVenta | null> {
    return this.http.get<ConfiguracionVenta>('/api/configuracion', SILENCIO()).pipe(catchError(() => of(null)));
  }

  empleados(): Observable<EmpleadoOpcion[] | null> {
    return this.http.get<unknown>('/api/empleados', { ...SILENCIO(), params: parametros({ activo: true, tamanoPagina: 100 }) }).pipe(
      map((r) => normalizarPagina<EmpleadoOpcion>(r).elementos),
      catchError(() => of(null)),
    );
  }

  servicios(buscar = '', tamano = 30): Observable<ServicioCatalogo[]> {
    return this.http.get<unknown>('/api/servicios', { ...SILENCIO(), params: parametros({ buscar: buscar.trim(), tamanoPagina: tamano }) }).pipe(
      map((r) => normalizarPagina<ServicioCatalogo>(r).elementos),
      catchError(() => of([])),
    );
  }

  /** Productos activos (los insumos no se venden). null = sin acceso. */
  productos(buscar = '', tamano = 30): Observable<ArticuloCatalogo[] | null> {
    return this.http
      .get<unknown>('/api/inventario/articulos', { ...SILENCIO(), params: parametros({ tipo: 'Producto', activo: true, buscar: buscar.trim(), tamanoPagina: tamano }) })
      .pipe(
        map((r) => normalizarPagina<ArticuloCatalogo>(r).elementos),
        catchError(() => of(null)),
      );
  }
}
