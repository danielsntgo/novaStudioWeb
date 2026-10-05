import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { formatearFecha } from '../../core/tiempo/zona';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { columnaEstado } from '../../shared/componentes/tabla';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';
import { EditorHorario } from './editor-horario';

export interface Empleado {
  id: string;
  nombre: string;
  cargo: string;
  documento?: string | null;
  telefono?: string | null;
  correo?: string | null;
  activo: boolean;
  fechaCreacionUtc: string;
}

@Component({
  selector: 'app-empleados',
  imports: [ListaCrud, PanelLateral, EditorHorario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-lista-crud [config]="config" (accion)="alAccion($event)" />
    <app-panel-lateral [abierto]="empleadoHorario() !== null" titulo="Horario semanal" [subtitulo]="empleadoHorario()?.nombre ?? ''" ancho="ancho" (cerrar)="empleadoHorario.set(null)">
      @if (empleadoHorario(); as e) {
        <app-editor-horario [empleadoId]="e.id" (cerrar)="empleadoHorario.set(null)" />
      }
    </app-panel-lateral>
  `,
})
export class Empleados {
  protected readonly empleadoHorario = signal<Empleado | null>(null);

  protected readonly config: ConfigCrud<Empleado> = {
    titulo: 'Empleados',
    subtitulo: 'Tu equipo, sus cargos y los horarios en los que atienden.',
    textoNuevo: 'Nuevo empleado',
    singular: 'empleado',
    nombre: (e) => e.nombre,
    urlLista: '/api/empleados',
    paginado: true,
    buscador: 'Buscar por nombre, cargo o documento',
    filtroActivo: true,
    columnas: [
      { titulo: 'Empleado', valor: (e) => e.nombre, secundario: (e) => e.documento },
      { titulo: 'Cargo', valor: (e) => e.cargo },
      { titulo: 'Contacto', valor: (e) => e.telefono ?? '—', secundario: (e) => e.correo, ocultarEnMovil: true },
      columnaEstado<Empleado>(),
      { titulo: 'Registro', valor: (e) => formatearFecha(e.fechaCreacionUtc), ocultarEnMovil: true },
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre completo', tipo: 'texto', requerido: true },
      { nombre: 'cargo', etiqueta: 'Cargo', tipo: 'texto', requerido: true, marcador: 'Ej.: Estilista, Barbero, Manicurista' },
      { nombre: 'documento', etiqueta: 'Documento de identidad', tipo: 'texto', ancho: 'medio' },
      { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', ancho: 'medio' },
      { nombre: 'correo', etiqueta: 'Correo electrónico', tipo: 'email' },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    acciones: [{ id: 'horario', etiqueta: 'Horario', visible: (e) => e.activo }],
    mensajeCreado: 'El empleado se creó correctamente.',
    mensajeActualizado: 'Los datos del empleado se actualizaron.',
    vacio: { titulo: 'Aún no hay empleados', detalle: 'Registra a tu equipo para poder agendar citas.' },
  };

  protected alAccion(evento: { id: string; fila: Empleado }): void {
    if (evento.id === 'horario') this.empleadoHorario.set(evento.fila);
  }
}
