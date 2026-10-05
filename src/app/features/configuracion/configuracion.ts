import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';
import { columnaEstado } from '../../shared/componentes/tabla';
import { numero } from '../../core/api/paginas';
import { DatosNegocio } from './datos-negocio';
import { Numeracion } from './numeracion';

interface Impuesto {
  id: string;
  nombre: string;
  porcentaje: number | string;
  activo: boolean;
}

interface MetodoPago {
  id: string;
  nombre: string;
  requiereReferencia: boolean;
  esEfectivo: boolean;
  activo: boolean;
}

type Pestana = 'negocio' | 'impuestos' | 'pagos' | 'numeracion';

@Component({
  selector: 'app-configuracion',
  imports: [ListaCrud, DatosNegocio, Numeracion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.css',
})
export class Configuracion {
  protected readonly pestana = signal<Pestana>('negocio');

  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'negocio', titulo: 'Negocio' },
    { id: 'impuestos', titulo: 'Impuestos' },
    { id: 'pagos', titulo: 'Métodos de pago' },
    { id: 'numeracion', titulo: 'Numeración' },
  ];

  protected readonly impuestos: ConfigCrud<Impuesto> = {
    titulo: 'Impuestos',
    subtitulo: 'Los impuestos disponibles para aplicar en tus ventas.',
    textoNuevo: 'Nuevo impuesto',
    singular: 'impuesto',
    nombre: (i) => i.nombre,
    urlLista: '/api/configuracion/impuestos',
    paginado: false,
    filtroActivo: false,
    incrustado: true,
    columnas: [
      { titulo: 'Impuesto', valor: (i) => i.nombre },
      { titulo: 'Porcentaje', valor: (i) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(numero(i.porcentaje))} %`, alinear: 'derecha' },
      columnaEstado<Impuesto>(),
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, marcador: 'Ej.: IVA' },
      { nombre: 'porcentaje', etiqueta: 'Porcentaje', tipo: 'decimal', requerido: true, min: 0, ayuda: 'Por ejemplo, 19 para un impuesto del 19 %.' },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    mensajeCreado: 'El impuesto se creó correctamente.',
    mensajeActualizado: 'El impuesto se actualizó correctamente.',
    vacio: { titulo: 'Sin impuestos', detalle: 'Agrega los impuestos que aplicas en tu negocio.' },
  };

  protected readonly pagos: ConfigCrud<MetodoPago> = {
    titulo: 'Métodos de pago',
    subtitulo: 'Las formas de pago que aceptas al cobrar.',
    textoNuevo: 'Nuevo método de pago',
    singular: 'método de pago',
    nombre: (m) => m.nombre,
    urlLista: '/api/configuracion/metodos-pago',
    paginado: false,
    filtroActivo: false,
    incrustado: true,
    columnas: [
      { titulo: 'Método', valor: (m) => m.nombre },
      {
        titulo: 'Tipo',
        valor: (m) => (m.esEfectivo ? 'Efectivo' : 'No efectivo'),
        insignia: (m) => ({ texto: m.esEfectivo ? 'Efectivo' : 'No efectivo', tono: m.esEfectivo ? 'exito' : 'gris' }),
        ocultarEnMovil: true,
      },
      {
        titulo: 'Referencia',
        valor: (m) => (m.requiereReferencia ? 'Obligatoria' : 'No requerida'),
        insignia: (m) => ({ texto: m.requiereReferencia ? 'Obligatoria' : 'No requerida', tono: m.requiereReferencia ? 'azul' : 'gris' }),
        ocultarEnMovil: true,
      },
      columnaEstado<MetodoPago>(),
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, marcador: 'Ej.: Efectivo, Tarjeta, Transferencia' },
      { nombre: 'esEfectivo', etiqueta: 'Es pago en efectivo', tipo: 'casilla', ayuda: 'Solo puede existir un método marcado como efectivo.' },
      { nombre: 'requiereReferencia', etiqueta: 'Requiere número de referencia', tipo: 'casilla', ayuda: 'Pide el comprobante o número de transacción al cobrar.' },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    mensajeCreado: 'El método de pago se creó correctamente.',
    mensajeActualizado: 'El método de pago se actualizó correctamente.',
    vacio: { titulo: 'Sin métodos de pago', detalle: 'Agrega al menos uno para poder cobrar.' },
  };
}
