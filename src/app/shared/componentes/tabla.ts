import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, contentChild, input } from '@angular/core';

export type TonoInsignia = 'exito' | 'gris' | 'aviso' | 'peligro' | 'azul';

export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => string;
  /** Segunda línea más tenue bajo el valor principal. */
  secundario?: (fila: T) => string | null | undefined;
  /** Si se define, la celda se muestra como una etiqueta de color. */
  insignia?: (fila: T) => { texto: string; tono: TonoInsignia } | null;
  alinear?: 'derecha' | 'centro';
  /** Oculta la columna en pantallas pequeñas. */
  ocultarEnMovil?: boolean;
}

/** Columna de estado activo/inactivo lista para usar. */
export function columnaEstado<T extends { activo?: boolean }>(titulo = 'Estado'): Columna<T> {
  return {
    titulo,
    valor: (f) => (f.activo ? 'Activo' : 'Inactivo'),
    insignia: (f) => ({ texto: f.activo ? 'Activo' : 'Inactivo', tono: f.activo ? 'exito' : 'gris' }),
  };
}

@Component({
  selector: 'app-tabla',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabla.html',
  styleUrl: './tabla.css',
})
export class Tabla<T> {
  readonly columnas = input.required<Columna<T>[]>();
  readonly filas = input.required<T[]>();
  readonly cargando = input(false);
  readonly vacioTitulo = input('Sin resultados');
  readonly vacioDetalle = input('');

  /** Plantilla opcional con las acciones de cada fila: <ng-template #acciones let-fila>. */
  protected readonly acciones = contentChild<TemplateRef<{ $implicit: T }>>('acciones');
  protected readonly esqueleto = [1, 2, 3, 4, 5];
}
