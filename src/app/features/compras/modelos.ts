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

export interface Compra {
  id: string;
  proveedorId: string;
  nombreProveedor: string;
  fechaCompraUtc: string;
  referencia?: string | null;
  observacion?: string | null;
  codigoMoneda: string;
  estado: 'Borrador' | 'Confirmada' | string;
  fechaConfirmacionUtc?: string | null;
  total: number | string;
  detalles: DetalleCompra[];
}
