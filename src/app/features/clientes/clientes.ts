import { ChangeDetectionStrategy, Component } from '@angular/core';
import { formatearFecha } from '../../core/tiempo/zona';
import { columnaEstado } from '../../shared/componentes/tabla';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';

export interface Cliente {
  id: string;
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
  correo?: string | null;
  activo: boolean;
  fechaCreacionUtc: string;
}

@Component({
  selector: 'app-clientes',
  imports: [ListaCrud],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-lista-crud [config]="config" />`,
})
export class Clientes {
  protected readonly config: ConfigCrud<Cliente> = {
    titulo: 'Clientes',
    subtitulo: 'Administra los clientes de tu negocio.',
    textoNuevo: 'Nuevo cliente',
    singular: 'cliente',
    nombre: (c) => c.nombre,
    urlLista: '/api/clientes',
    paginado: true,
    buscador: 'Buscar por nombre, documento o teléfono',
    filtroActivo: true,
    columnas: [
      { titulo: 'Cliente', valor: (c) => c.nombre, secundario: (c) => c.documento },
      { titulo: 'Contacto', valor: (c) => c.telefono ?? '—', secundario: (c) => c.correo, ocultarEnMovil: true },
      columnaEstado<Cliente>(),
      { titulo: 'Registro', valor: (c) => formatearFecha(c.fechaCreacionUtc), ocultarEnMovil: true },
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre completo', tipo: 'texto', requerido: true },
      { nombre: 'documento', etiqueta: 'Documento de identidad', tipo: 'texto', ancho: 'medio' },
      { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', ancho: 'medio' },
      { nombre: 'correo', etiqueta: 'Correo electrónico', tipo: 'email' },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    mensajeCreado: 'El cliente se creó correctamente.',
    mensajeActualizado: 'Los datos del cliente se actualizaron.',
    vacio: { titulo: 'Aún no hay clientes', detalle: 'Crea el primero con el botón «Nuevo cliente».' },
  };
}
