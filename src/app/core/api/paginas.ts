import { HttpParams } from '@angular/common/http';

export interface Pagina<T> {
  elementos: T[];
  pagina: number;
  tamanoPagina: number;
  total: number;
}

/** Los DTO de página usan `total` o `totalElementos` según el módulo; aquí se unifican. */
export function normalizarPagina<T>(respuesta: unknown, tamanoPorDefecto = 20): Pagina<T> {
  if (Array.isArray(respuesta)) {
    return { elementos: respuesta as T[], pagina: 1, tamanoPagina: respuesta.length || tamanoPorDefecto, total: respuesta.length };
  }
  const r = (respuesta ?? {}) as Record<string, unknown>;
  const elementos = (Array.isArray(r['elementos']) ? r['elementos'] : []) as T[];
  return {
    elementos,
    pagina: Number(r['pagina'] ?? 1),
    tamanoPagina: Number(r['tamanoPagina'] ?? tamanoPorDefecto),
    total: Number(r['total'] ?? r['totalElementos'] ?? elementos.length),
  };
}

type ValorParametro = string | number | boolean | null | undefined;

/** Construye HttpParams omitiendo los valores vacíos. */
export function parametros(valores: Record<string, ValorParametro>): HttpParams {
  let params = new HttpParams();
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === null || valor === undefined || valor === '') continue;
    params = params.set(clave, String(valor));
  }
  return params;
}

/** Número seguro: los DTO pueden traer números como texto. */
export function numero(valor: number | string | null | undefined): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}
