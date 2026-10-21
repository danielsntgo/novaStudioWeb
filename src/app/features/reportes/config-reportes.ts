import { TonoInsignia } from '../../shared/componentes/tabla';

export type TipoReporte = 'ventas' | 'ingresos' | 'productos' | 'servicios' | 'inventario' | 'compras' | 'caja' | 'clientes' | 'empleados' | 'comisiones';
export type FuenteOpciones = 'clientes' | 'empleados' | 'servicios' | 'articulos' | 'proveedores' | 'metodosPago' | 'fija';

export interface FiltroReporte {
  /** Nombre del parámetro de consulta de la API. */
  param: 'clienteId' | 'empleadoId' | 'articuloId' | 'servicioId' | 'proveedorId' | 'metodoPagoId' | 'estado';
  etiqueta: string;
  fuente: FuenteOpciones;
  opciones?: { valor: string; etiqueta: string }[];
}

export interface DefinicionReporte {
  tipo: TipoReporte;
  titulo: string;
  descripcion: string;
  icono: string;
  /** false = el informe es una fotografía actual y no admite fechas. */
  fechas: boolean;
  filtros: FiltroReporte[];
}

const CLIENTE: FiltroReporte = { param: 'clienteId', etiqueta: 'Todos los clientes', fuente: 'clientes' };
const EMPLEADO: FiltroReporte = { param: 'empleadoId', etiqueta: 'Todos los empleados', fuente: 'empleados' };

export const REPORTES: DefinicionReporte[] = [
  {
    tipo: 'ventas', titulo: 'Ventas', icono: 'bolsa', fechas: true,
    descripcion: 'Una fila por venta: total, pagado, devuelto y saldo pendiente.',
    filtros: [CLIENTE, { param: 'estado', etiqueta: 'Todos los estados', fuente: 'fija', opciones: [
      { valor: 'Finalizada', etiqueta: 'Finalizada' }, { valor: 'ParcialmenteDevuelta', etiqueta: 'Devolución parcial' }, { valor: 'Devuelta', etiqueta: 'Devuelta' }, { valor: 'Anulada', etiqueta: 'Anulada' } ] }],
  },
  {
    tipo: 'ingresos', titulo: 'Ingresos', icono: 'cartera', fechas: true,
    descripcion: 'Pagos y reembolsos por método de pago. No equivale al total vendido.',
    filtros: [CLIENTE, { param: 'metodoPagoId', etiqueta: 'Todos los métodos', fuente: 'metodosPago' }],
  },
  {
    tipo: 'productos', titulo: 'Productos vendidos', icono: 'caja', fechas: true,
    descripcion: 'Ventas y devoluciones de productos, con cantidades e importes.',
    filtros: [{ param: 'articuloId', etiqueta: 'Todos los productos', fuente: 'articulos' }],
  },
  {
    tipo: 'servicios', titulo: 'Servicios vendidos', icono: 'destellos', fechas: true,
    descripcion: 'Ventas y devoluciones de servicios, por empleado.',
    filtros: [{ param: 'servicioId', etiqueta: 'Todos los servicios', fuente: 'servicios' }, EMPLEADO],
  },
  {
    tipo: 'inventario', titulo: 'Inventario', icono: 'caja', fechas: false,
    descripcion: 'Fotografía de las existencias actuales, su valor y los artículos bajo el mínimo.',
    filtros: [{ param: 'articuloId', etiqueta: 'Todos los artículos', fuente: 'articulos' }],
  },
  {
    tipo: 'compras', titulo: 'Compras', icono: 'camion', fechas: true,
    descripcion: 'Compras a proveedores, confirmadas y en borrador.',
    filtros: [{ param: 'proveedorId', etiqueta: 'Todos los proveedores', fuente: 'proveedores' }, { param: 'estado', etiqueta: 'Todos los estados', fuente: 'fija', opciones: [{ valor: 'Borrador', etiqueta: 'Borrador' }, { valor: 'Confirmada', etiqueta: 'Confirmada' }] }],
  },
  {
    tipo: 'caja', titulo: 'Caja', icono: 'cartera', fechas: true,
    descripcion: 'Una fila por sesión de caja: efectivo esperado, contado y diferencia.',
    filtros: [{ param: 'estado', etiqueta: 'Todos los estados', fuente: 'fija', opciones: [{ valor: 'Abierta', etiqueta: 'Abierta' }, { valor: 'Cerrada', etiqueta: 'Cerrada' }] }],
  },
  {
    tipo: 'clientes', titulo: 'Clientes', icono: 'usuarios', fechas: true,
    descripcion: 'Actividad de los clientes con ventas: total vendido, devuelto y saldo.',
    filtros: [CLIENTE],
  },
  {
    tipo: 'empleados', titulo: 'Empleados', icono: 'credencial', fechas: true,
    descripcion: 'Servicios vendidos y comisiones netas por empleado.',
    filtros: [EMPLEADO],
  },
  {
    tipo: 'comisiones', titulo: 'Comisiones', icono: 'porcentaje', fechas: true,
    descripcion: 'Movimientos individuales de comisión, devengos y ajustes.',
    filtros: [EMPLEADO, { param: 'servicioId', etiqueta: 'Todos los servicios', fuente: 'servicios' }, { param: 'estado', etiqueta: 'Todos los estados', fuente: 'fija', opciones: [{ valor: 'Pendiente', etiqueta: 'Pendiente' }, { valor: 'Pagada', etiqueta: 'Pagada' }, { valor: 'Revertida', etiqueta: 'Revertida' }] }],
  },
];

/** Columnas con importes en dinero (la moneda viene en la columna `Moneda` de la fila). */
export const COLUMNAS_DINERO = new Set([
  'Subtotal', 'Descuentos', 'Impuestos', 'Total', 'Pagado', 'Devuelto', 'Reintegrado', 'Pendiente', 'Importe', 'BaseCalculo',
  'CostoPromedio', 'ValorInventario', 'PrecioVenta', 'EfectivoInicial', 'PagosVenta', 'IngresosManuales', 'Reembolsos',
  'EgresosManuales', 'PagoComisiones', 'EfectivoEsperado', 'EfectivoContado', 'Diferencia', 'TotalVentas', 'TotalDevuelto',
  'TotalNeto', 'TotalPagado', 'TotalReintegrado', 'SaldoPendiente', 'TotalServicios', 'ComisionesDevengadas', 'AjustesDevolucion',
  'ComisionesNetas',
]);

const ETIQUETAS: Record<string, string> = {
  FechaVentaUtc: 'Fecha', FechaUtc: 'Fecha', FechaCompraUtc: 'Fecha', AperturaUtc: 'Apertura', CierreUtc: 'Cierre',
  EsEfectivo: 'Efectivo', ManejaFraccion: 'Admite fracciones', BajoMinimo: 'Bajo mínimo', DocumentoCliente: 'Documento',
  MetodoPago: 'Método de pago', CostoPromedio: 'Costo promedio', ValorInventario: 'Valor inventario', PrecioVenta: 'Precio de venta',
  PagosVenta: 'Pagos de venta', IngresosManuales: 'Ingresos manuales', EgresosManuales: 'Egresos manuales', PagoComisiones: 'Pago de comisiones',
  EfectivoEsperado: 'Esperado', EfectivoContado: 'Contado', EfectivoInicial: 'Efectivo inicial', LineasServicio: 'Líneas de servicio',
  CantidadServicios: 'Servicios', TotalServicios: 'Total servicios', ComisionesDevengadas: 'Comisiones', AjustesDevolucion: 'Ajustes',
  ComisionesNetas: 'Comisiones netas', BaseCalculo: 'Base de cálculo', TotalVentas: 'Total vendido', TotalNeto: 'Total neto',
  TotalPagado: 'Total pagado', TotalReintegrado: 'Reintegrado', TotalDevuelto: 'Devuelto', SaldoPendiente: 'Saldo pendiente',
};

/** "FechaVentaUtc" -> "Fecha venta". */
export function etiquetaColumna(clave: string): string {
  if (ETIQUETAS[clave]) return ETIQUETAS[clave];
  const sinUtc = clave.replace(/Utc$/, '');
  const palabras = sinUtc.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}

/** Las columnas de identificadores y la moneda no se muestran: no aportan a quien lee el informe. */
export function esColumnaVisible(clave: string): boolean {
  return clave !== 'Moneda' && !/Id$/.test(clave);
}

export const TONO_ESTADO: Record<string, TonoInsignia> = {
  Finalizada: 'exito', ParcialmenteDevuelta: 'aviso', Devuelta: 'gris', Anulada: 'peligro',
  Borrador: 'aviso', Confirmada: 'exito', Abierta: 'exito', Cerrada: 'gris',
  Pendiente: 'aviso', Pagada: 'exito', Revertida: 'gris',
  PagoVenta: 'exito', Reembolso: 'aviso', DevengoServicio: 'azul', AjusteDevolucion: 'aviso',
  Producto: 'azul', Insumo: 'gris', Venta: 'exito', Devolucion: 'aviso',
};
