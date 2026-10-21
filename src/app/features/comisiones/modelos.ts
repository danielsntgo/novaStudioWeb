import { TonoInsignia } from '../../shared/componentes/tabla';

export interface ReglaComision {
  id: string;
  empleadoId: string;
  servicioId: string;
  tipo: 'Porcentaje' | 'ValorFijo' | string;
  valor: number | string;
  activa: boolean;
  fechaCreacionUtc: string;
  fechaModificacionUtc?: string | null;
}

export interface MovimientoComision {
  id: string;
  empleadoId: string;
  servicioId: string;
  ventaId: string;
  detalleVentaId: string;
  tipoMovimiento: 'DevengoServicio' | 'AjusteDevolucion' | string;
  tipoTarifa: string;
  valorTarifa: number | string;
  baseCalculo: number | string;
  cantidad: number | string;
  importe: number | string;
  codigoMoneda: string;
  estado: 'Pendiente' | 'Pagada' | 'Revertida' | string;
  comisionOriginalId?: string | null;
  devolucionVentaId?: string | null;
  liquidacionComisionId?: string | null;
  fechaCreacionUtc: string;
}

export interface Liquidacion {
  id: string;
  empleadoId: string;
  metodoPagoId: string;
  metodoPagoNombre: string;
  esEfectivo: boolean;
  importe: number | string;
  codigoMoneda: string;
  referencia?: string | null;
  cajaId?: string | null;
  fechaUtc: string;
  comisionIds: string[];
}

export const ESTADOS_COMISION: Record<string, { texto: string; tono: TonoInsignia }> = {
  Pendiente: { texto: 'Pendiente', tono: 'aviso' },
  Pagada: { texto: 'Pagada', tono: 'exito' },
  Revertida: { texto: 'Revertida', tono: 'gris' },
};

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  DevengoServicio: 'Servicio vendido',
  AjusteDevolucion: 'Ajuste por devolución',
};
