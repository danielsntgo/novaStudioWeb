export interface Caja {
  id: string;
  estado: 'Abierta' | 'Cerrada' | string;
  efectivoApertura: number | string;
  fechaAperturaUtc: string;
  usuarioAperturaId: string;
  efectivoEsperado?: number | string | null;
  efectivoContadoCierre?: number | string | null;
  diferenciaCierre?: number | string | null;
  fechaCierreUtc?: string | null;
  usuarioCierreId?: string | null;
}

export interface MovimientoCaja {
  id: string;
  tipo: string;
  importe: number | string;
  codigoMoneda: string;
  concepto?: string | null;
  ventaId?: string | null;
  devolucionVentaId?: string | null;
  liquidacionComisionId?: string | null;
  fechaUtc: string;
  usuarioId?: string | null;
}

export interface CajaDetalle {
  caja: Caja;
  movimientos: MovimientoCaja[];
}

/** Cómo se muestra cada tipo de movimiento; `signo` indica si suma o resta al efectivo. */
export const TIPOS_MOVIMIENTO_CAJA: Record<string, { texto: string; signo: 1 | -1; tono: 'exito' | 'aviso' | 'azul' | 'peligro' | 'gris' }> = {
  PagoVenta: { texto: 'Pago de venta', signo: 1, tono: 'exito' },
  Reembolso: { texto: 'Reembolso', signo: -1, tono: 'aviso' },
  IngresoManual: { texto: 'Ingreso manual', signo: 1, tono: 'azul' },
  EgresoManual: { texto: 'Egreso manual', signo: -1, tono: 'peligro' },
  PagoComision: { texto: 'Pago de comisión', signo: -1, tono: 'aviso' },
};
