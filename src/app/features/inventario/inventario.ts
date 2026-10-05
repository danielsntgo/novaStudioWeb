import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { columnaEstado } from '../../shared/componentes/tabla';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';
import { MovimientosInventario } from './movimientos';

export interface ArticuloInventario {
  id: string;
  codigo?: string | null;
  nombre: string;
  tipo: 'Producto' | 'Insumo' | string;
  unidadBase: string;
  manejaFraccion: boolean;
  categoria?: string | null;
  existenciaActual: number | string;
  cantidadMinima: number | string;
  costoPromedio: number | string;
  codigoMoneda: string;
  precioVenta?: number | string | null;
  activo: boolean;
  bajoMinimo: boolean;
}

type Pestana = 'articulos' | 'movimientos';

@Component({
  selector: 'app-inventario',
  imports: [ListaCrud, MovimientosInventario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventario.html',
  styleUrl: './inventario.css',
})
export class Inventario {
  private readonly http = inject(HttpClient);
  protected readonly pestana = signal<Pestana>('articulos');

  protected readonly articulos: ConfigCrud<ArticuloInventario> = {
    titulo: 'Artículos',
    subtitulo: 'Productos que vendes e insumos que usas internamente.',
    textoNuevo: 'Nuevo artículo',
    singular: 'artículo',
    nombre: (a) => a.nombre,
    urlLista: '/api/inventario/articulos',
    urlItem: (id) => `/api/inventario/articulos/${id}`,
    paginado: true,
    buscador: 'Buscar por nombre o código',
    filtroActivo: true,
    incrustado: true,
    filtros: [
      {
        nombre: 'tipo',
        etiqueta: 'Todos los tipos',
        tipo: 'seleccion',
        opciones: [
          { valor: 'Producto', etiqueta: 'Productos' },
          { valor: 'Insumo', etiqueta: 'Insumos' },
        ],
      },
      { nombre: 'soloBajoMinimo', etiqueta: 'Solo bajo el mínimo', tipo: 'casilla' },
    ],
    columnas: [
      { titulo: 'Artículo', valor: (a) => a.nombre, secundario: (a) => [a.codigo, a.categoria].filter(Boolean).join(' · ') || null },
      {
        titulo: 'Tipo',
        valor: (a) => a.tipo,
        insignia: (a) => ({ texto: a.tipo === 'Producto' ? 'Producto' : 'Insumo', tono: a.tipo === 'Producto' ? 'azul' : 'gris' }),
        ocultarEnMovil: true,
      },
      {
        titulo: 'Existencia',
        valor: (a) => `${formatearCantidad(a.existenciaActual, a.manejaFraccion)} ${a.unidadBase}`,
        secundario: (a) => `Mínimo: ${formatearCantidad(a.cantidadMinima, a.manejaFraccion)}`,
      },
      {
        titulo: 'Stock',
        valor: (a) => (a.bajoMinimo ? 'Bajo mínimo' : 'Normal'),
        insignia: (a) => ({ texto: a.bajoMinimo ? 'Bajo mínimo' : 'Normal', tono: a.bajoMinimo ? 'aviso' : 'exito' }),
      },
      { titulo: 'Costo prom.', valor: (a) => formatearMoneda(a.costoPromedio, a.codigoMoneda), alinear: 'derecha', ocultarEnMovil: true },
      { titulo: 'Precio venta', valor: (a) => (a.precioVenta === null || a.precioVenta === undefined ? '—' : formatearMoneda(a.precioVenta, a.codigoMoneda)), alinear: 'derecha', ocultarEnMovil: true },
      columnaEstado<ArticuloInventario>(),
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', requerido: true, ancho: 'medio', opciones: [{ valor: 'Producto', etiqueta: 'Producto (se vende)' }, { valor: 'Insumo', etiqueta: 'Insumo (uso interno)' }] },
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', ancho: 'medio' },
      { nombre: 'unidadBase', etiqueta: 'Unidad de medida', tipo: 'texto', requerido: true, ancho: 'medio', marcador: 'Ej.: unidad, ml, g', ayuda: 'No se puede cambiar después de registrar movimientos.' },
      { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'texto', ancho: 'medio' },
      { nombre: 'cantidadMinima', etiqueta: 'Cantidad mínima', tipo: 'decimal', min: 0, valorPorDefecto: 0, ancho: 'medio', ayuda: 'Debajo de esta cantidad se genera una alerta.' },
      {
        nombre: 'precioVenta',
        etiqueta: 'Precio de venta',
        tipo: 'decimal',
        min: 0,
        requerido: true,
        ancho: 'medio',
        visibleSi: (v) => v['tipo'] === 'Producto',
      },
      { nombre: 'manejaFraccion', etiqueta: 'Permite cantidades fraccionadas', tipo: 'casilla', ayuda: 'Actívalo para artículos que se miden con decimales (hasta 3), como ml o g. No se puede cambiar después de registrar movimientos.' },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    acciones: [
      {
        id: 'entrada',
        etiqueta: 'Entrada',
        visible: (a) => a.activo,
        formulario: {
          titulo: () => 'Registrar entrada',
          subtitulo: (a) => a.nombre,
          campos: [
            { nombre: 'cantidad', etiqueta: 'Cantidad que ingresa', tipo: 'decimal', requerido: true, min: 0, ancho: 'medio' },
            { nombre: 'costoUnitario', etiqueta: 'Costo unitario', tipo: 'decimal', requerido: true, min: 0, ancho: 'medio' },
            { nombre: 'motivo', etiqueta: 'Motivo', tipo: 'texto', marcador: 'Ej.: Ajuste por conteo físico' },
          ],
          enviar: (a, valor) => this.http.post(`/api/inventario/articulos/${a.id}/entradas-ajuste`, valor),
          mensajeExito: 'La entrada se registró y la existencia se actualizó.',
          textoGuardar: 'Registrar entrada',
        },
      },
      {
        id: 'salida',
        etiqueta: 'Salida',
        visible: (a) => a.activo,
        formulario: {
          titulo: () => 'Registrar salida',
          subtitulo: (a) => `${a.nombre} · existencia: ${formatearCantidad(a.existenciaActual, a.manejaFraccion)} ${a.unidadBase}`,
          campos: [
            { nombre: 'cantidad', etiqueta: 'Cantidad que sale', tipo: 'decimal', requerido: true, min: 0 },
            { nombre: 'motivo', etiqueta: 'Motivo', tipo: 'texto', requerido: true, marcador: 'Ej.: Producto dañado, uso interno' },
          ],
          enviar: (a, valor) => this.http.post(`/api/inventario/articulos/${a.id}/salidas-ajuste`, valor),
          mensajeExito: 'La salida se registró y la existencia se actualizó.',
          textoGuardar: 'Registrar salida',
        },
      },
    ],
    mensajeCreado: 'El artículo se creó correctamente.',
    mensajeActualizado: 'El artículo se actualizó correctamente.',
    vacio: { titulo: 'No hay artículos', detalle: 'Crea productos e insumos para controlar tus existencias.' },
    anchoPanel: 'normal',
  };
}
