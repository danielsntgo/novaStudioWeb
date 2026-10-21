import { MetodoPagoOpcion } from '../../core/api/catalogos.service';
import { PagoEditable, pagosParaApi, problemaDePagos } from './pagos-editor';

const metodos: MetodoPagoOpcion[] = [
  { id: 'ef', nombre: 'Efectivo', requiereReferencia: false, esEfectivo: true, activo: true },
  { id: 'tj', nombre: 'Tarjeta', requiereReferencia: true, esEfectivo: false, activo: true },
];
const pago = (o: Partial<PagoEditable>): PagoEditable => ({ metodoPagoId: 'ef', importe: 1000, referencia: '', ...o });

describe('pagos', () => {
  it('acepta pagos válidos', () => {
    expect(problemaDePagos([pago({}), pago({ metodoPagoId: 'tj', referencia: 'AUT-1' })], metodos)).toBeNull();
  });

  it('exige método, importe positivo y referencia cuando el método la pide', () => {
    expect(problemaDePagos([pago({ metodoPagoId: '' })], metodos)).toContain('selecciona el método');
    expect(problemaDePagos([pago({ importe: 0 })], metodos)).toContain('mayor que cero');
    expect(problemaDePagos([pago({ importe: null })], metodos)).toContain('mayor que cero');
    expect(problemaDePagos([pago({ metodoPagoId: 'tj', referencia: '  ' })], metodos)).toContain('referencia');
  });

  it('indica el número del pago con problema', () => {
    expect(problemaDePagos([pago({}), pago({ importe: -5 })], metodos)).toContain('Pago 2');
  });

  it('pagosParaApi limpia espacios y convierte referencia vacía en null', () => {
    expect(pagosParaApi([pago({ importe: 2500 }), pago({ metodoPagoId: 'tj', referencia: ' AUT-9 ' })])).toEqual([
      { metodoPagoId: 'ef', importe: 2500, referencia: null },
      { metodoPagoId: 'tj', importe: 1000, referencia: 'AUT-9' },
    ]);
  });
});
