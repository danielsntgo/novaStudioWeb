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

type Pestana = 'negocio' | 'impuestos' | 'numeracion';

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

}
