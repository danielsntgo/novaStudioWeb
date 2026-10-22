export interface DetalleCompra {
  id: string;
  articuloId: string;
  nombreArticulo: string;
  unidadBase: string;
  cantidad: number | string;
  costoUnitario: number | string;
  totalLinea: number | string;
  codigoMoneda: string;
}

export interface DevolucionCompra {
  id: string;
  fechaUtc: string;
  motivo: string;
  importeLineas: number | string;
  importeReintegrado: number | string;
  lineas: { detalleCompraId: string; cantidad: number | string; importe: number | string }[];
  pagos: {
    metodoPagoId: string;
    metodoPagoNombre: string;
    esEfectivo: boolean;
    cuentaFinancieraId: string;
    cuentaFinancieraNombre: string;
    importe: number | string;
    referencia: string | null;
  }[];
}

export interface Compra {
  id: string;
  proveedorId: string;
  nombreProveedor: string;
  fechaCompraUtc: string;
  referencia?: string | null;
  observacion?: string | null;
  codigoMoneda: string;
  estado: 'Borrador' | 'Confirmada' | 'ParcialmenteDevuelta' | 'Devuelta' | 'Anulada' | string;
  fechaConfirmacionUtc?: string | null;
  totalDevuelto: number | string;
  saldoNeto: number | string;
  motivoAnulacion?: string | null;
  fechaAnulacionUtc?: string | null;
  total: number | string;
  detalles: DetalleCompra[];
  devoluciones: DevolucionCompra[];
}
