import { EntradaLinea, calcularVenta } from './calculo';

const linea = (o: Partial<EntradaLinea> = {}): EntradaLinea => ({ precio: 100, cantidad: 1, descuentoTipo: '', descuentoValor: 0, tasaImpuesto: 0, ...o });

describe('calcularVenta', () => {
  it('sin descuentos ni impuestos, el total es precio por cantidad', () => {
    const c = calcularVenta([linea({ precio: 45000 }), linea({ precio: 38000, cantidad: 2 })], '', 0);
    expect(c.subtotal).toBe(121000);
    expect(c.total).toBe(121000);
    expect(c.descuentos).toBe(0);
    expect(c.impuestos).toBe(0);
  });

  it('aplica el impuesto sobre la base ya descontada', () => {
    const c = calcularVenta([linea({ precio: 1000, descuentoTipo: 'Porcentaje', descuentoValor: 10, tasaImpuesto: 19 })], '', 0);
    // base 900, impuesto 171
    expect(c.descuentos).toBe(100);
    expect(c.impuestos).toBe(171);
    expect(c.total).toBe(1071);
  });

  it('un descuento fijo nunca supera el valor de la línea', () => {
    const c = calcularVenta([linea({ precio: 500, descuentoTipo: 'ImporteFijo', descuentoValor: 9999 })], '', 0);
    expect(c.total).toBe(0);
    expect(c.descuentos).toBe(500);
  });

  it('un porcentaje mayor a 100 se limita a 100', () => {
    expect(calcularVenta([linea({ precio: 200, descuentoTipo: 'Porcentaje', descuentoValor: 250 })], '', 0).total).toBe(0);
  });

  it('el descuento general se reparte en proporción al valor de cada línea', () => {
    const c = calcularVenta([linea({ precio: 300 }), linea({ precio: 100 })], 'ImporteFijo', 40);
    expect(c.filas[0].descuentoGeneral).toBe(30);
    expect(c.filas[1].descuentoGeneral).toBe(10);
    expect(c.total).toBe(360);
  });

  it('el descuento general se calcula después del descuento de línea', () => {
    const c = calcularVenta([linea({ precio: 1000, descuentoTipo: 'Porcentaje', descuentoValor: 50 }), linea({ precio: 500 })], 'Porcentaje', 10);
    // bases: 500 y 500 -> 10 % = 100 -> 50 y 50
    expect(c.descuentos).toBe(600);
    expect(c.total).toBe(900);
  });

  it('redondea cada línea a dos decimales', () => {
    const c = calcularVenta([linea({ precio: 33.33, cantidad: 3, tasaImpuesto: 19 })], '', 0);
    expect(c.filas[0].bruto).toBe(99.99);
    expect(c.filas[0].impuesto).toBe(19);
    expect(c.total).toBe(118.99);
  });

  it('una venta sin líneas da cero', () => {
    const c = calcularVenta([], 'Porcentaje', 10);
    expect(c.total).toBe(0);
    expect(c.filas).toEqual([]);
  });
});
