/** Cálculo estimado del total de una venta, en el mismo orden que usa el sistema:
 *  descuento de línea → descuento general (prorrateado) → impuesto. El valor oficial lo calcula el backend. */

export type TipoDescuento = '' | 'Porcentaje' | 'ImporteFijo';

export interface EntradaLinea {
  precio: number;
  cantidad: number;
  descuentoTipo: TipoDescuento;
  descuentoValor: number;
  /** Porcentaje del impuesto de la línea (0 si no lleva). */
  tasaImpuesto: number;
}

export interface CalculoLinea {
  bruto: number;
  descuento: number;
  descuentoGeneral: number;
  impuesto: number;
  total: number;
}

export interface CalculoVenta {
  filas: CalculoLinea[];
  subtotal: number;
  descuentos: number;
  impuestos: number;
  total: number;
}

export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function descuentoSobre(base: number, tipo: TipoDescuento, valor: number): number {
  if (!tipo || valor <= 0 || base <= 0) return 0;
  return r2(tipo === 'Porcentaje' ? (base * Math.min(valor, 100)) / 100 : Math.min(valor, base));
}

export function calcularVenta(lineas: EntradaLinea[], descGeneralTipo: TipoDescuento, descGeneralValor: number): CalculoVenta {
  const brutos = lineas.map((l) => r2(l.cantidad * l.precio));
  const descLinea = lineas.map((l, i) => descuentoSobre(brutos[i], l.descuentoTipo, l.descuentoValor));
  const base1 = brutos.map((b, i) => b - descLinea[i]);
  const suma1 = base1.reduce((s, b) => s + b, 0);
  const descGeneralTotal = descuentoSobre(suma1, descGeneralTipo, descGeneralValor);

  const filas: CalculoLinea[] = lineas.map((l, i) => {
    const dg = suma1 > 0 ? r2((descGeneralTotal * base1[i]) / suma1) : 0;
    const base = base1[i] - dg;
    const impuesto = r2((base * l.tasaImpuesto) / 100);
    return { bruto: brutos[i], descuento: descLinea[i], descuentoGeneral: dg, impuesto, total: r2(base + impuesto) };
  });

  const sumar = (f: (x: CalculoLinea) => number) => r2(filas.reduce((s, x) => s + f(x), 0));
  return {
    filas,
    subtotal: sumar((x) => x.bruto),
    descuentos: sumar((x) => x.descuento + x.descuentoGeneral),
    impuestos: sumar((x) => x.impuesto),
    total: sumar((x) => x.total),
  };
}
