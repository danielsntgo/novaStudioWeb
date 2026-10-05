import { numero } from '../../core/api/paginas';

const formateadores = new Map<string, Intl.NumberFormat>();

/** 50000 + "COP" -> "$ 50.000". COP no usa decimales; el resto, dos. */
export function formatearMoneda(valor: number | string | null | undefined, codigo = 'COP'): string {
  let f = formateadores.get(codigo);
  if (!f) {
    const decimales = codigo === 'COP' ? 0 : 2;
    try {
      f = new Intl.NumberFormat('es-CO', { style: 'currency', currency: codigo, minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    } catch {
      f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    formateadores.set(codigo, f);
  }
  return f.format(numero(valor));
}

/** Cantidades: enteras si el artículo no maneja fracciones; hasta 3 decimales si sí. */
export function formatearCantidad(valor: number | string | null | undefined, fraccion = true): string {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: fraccion ? 3 : 0 }).format(numero(valor));
}
