import { TonoInsignia } from '../../shared/componentes/tabla';

export interface LineaVenta {
  id: string;
  tipo: 'Producto' | 'Servicio' | string;
  articuloInventarioId?: string | null;
  servicioId?: string | null;
  empleadoId?: string | null;
  codigo?: string | null;
  manejaFraccion: boolean;
  nombre: string;
  unidad: string;
  cantidad: number | string;
  precioUnitario: number | string;
  tipoDescuento?: string | null;
  valorDescuento: number | string;
  descuentoImporte: number | string;
  descuentoGeneralImporte: number | string;
  impuestoNombre?: string | null;
  impuestoPorcentaje?: number | string | null;
  impuestoImporte: number | string;
  totalImporte: number | string;
}

export interface PagoVenta {
  id: string;
  metodoPagoId: string;
  metodoPagoNombre: string;
  esEfectivo: boolean;
  importe: number | string;
  referencia?: string | null;
  fechaUtc: string;
}

export interface DocumentoVenta {
  id: string;
  tipoDocumento: 'Factura' | 'Comprobante' | string;
  numeroCompleto: string;
  fechaEmisionUtc: string;
  total: number | string;
}

export interface DevolucionVenta {
  id: string;
  fechaUtc: string;
  motivo: string;
  importeLineas: number | string;
  importeReintegrado: number | string;
  lineas: { detalleVentaId: string; cantidad: number | string; importe: number | string }[];
  pagos: { metodoPagoId: string; metodoPagoNombre: string; esEfectivo: boolean; importe: number | string; referencia?: string | null }[];
}

export interface Venta {
  id: string;
  cajaId: string;
  clienteId?: string | null;
  clienteNombre?: string | null;
  clienteDocumento?: string | null;
  fechaVentaUtc: string;
  codigoMoneda: string;
  estado: 'Finalizada' | 'ParcialmenteDevuelta' | 'Devuelta' | 'Anulada' | string;
  subtotal: number | string;
  tipoDescuentoGeneral?: string | null;
  valorDescuentoGeneral: number | string;
  descuentoLineas: number | string;
  descuentoGeneral: number | string;
  impuestos: number | string;
  total: number | string;
  totalPagado: number | string;
  totalDevuelto: number | string;
  totalReintegrado: number | string;
  totalPendiente: number | string;
  motivoAnulacion?: string | null;
  fechaAnulacionUtc?: string | null;
  lineas: LineaVenta[];
  pagos: PagoVenta[];
  documentos: DocumentoVenta[];
  devoluciones: DevolucionVenta[];
  fechaCreacionUtc: string;
}

export const ESTADOS_VENTA: Record<string, { texto: string; tono: TonoInsignia }> = {
  Finalizada: { texto: 'Finalizada', tono: 'exito' },
  ParcialmenteDevuelta: { texto: 'Devolución parcial', tono: 'aviso' },
  Devuelta: { texto: 'Devuelta', tono: 'gris' },
  Anulada: { texto: 'Anulada', tono: 'peligro' },
};

export function documentoDe(venta: Venta, tipo: 'Comprobante' | 'Factura'): DocumentoVenta | undefined {
  return venta.documentos.find((d) => d.tipoDocumento === tipo);
}

/** Una venta admite devolución o anulación mientras conserve unidades sin devolver. */
export function admiteDevolucion(estado: string): boolean {
  return estado === 'Finalizada' || estado === 'ParcialmenteDevuelta';
}
