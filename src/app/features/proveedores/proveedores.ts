import { ChangeDetectionStrategy, Component } from '@angular/core';
import { formatearFecha } from '../../core/tiempo/zona';
import { columnaEstado } from '../../shared/componentes/tabla';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';

export interface Proveedor {
  id: string;
  nombre: string;
  identificacionFiscal?: string | null;
  telefono?: string | null;
  correo?: string | null;
  activo: boolean;
  fechaCreacionUtc: string;
}

@Component({
  selector: 'app-proveedores',
  imports: [ListaCrud],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-lista-crud [config]="config" />`,
})
export class Proveedores {
  protected readonly config: ConfigCrud<Proveedor> = {
    titulo: 'Proveedores',
    subtitulo: 'Directorio de proveedores para tus compras.',
    textoNuevo: 'Nuevo proveedor',
    singular: 'proveedor',
    nombre: (p) => p.nombre,
    urlLista: '/api/proveedores',
    paginado: true,
    buscador: 'Buscar por nombre o identificación',
    filtroActivo: true,
    columnas: [
      { titulo: 'Proveedor', valor: (p) => p.nombre, secundario: (p) => p.identificacionFiscal },
      { titulo: 'Contacto', valor: (p) => p.telefono ?? '—', secundario: (p) => p.correo, ocultarEnMovil: true },
      columnaEstado<Proveedor>(),
      { titulo: 'Registro', valor: (p) => formatearFecha(p.fechaCreacionUtc), ocultarEnMovil: true },
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre o razón social', tipo: 'texto', requerido: true },
      { nombre: 'identificacionFiscal', etiqueta: 'Identificación fiscal (NIT)', tipo: 'texto' },
      { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', ancho: 'medio' },
      { nombre: 'correo', etiqueta: 'Correo electrónico', tipo: 'email', ancho: 'medio' },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    mensajeCreado: 'El proveedor se creó correctamente.',
    mensajeActualizado: 'Los datos del proveedor se actualizaron.',
    vacio: { titulo: 'Aún no hay proveedores', detalle: 'Registra tus proveedores para poder crear compras.' },
  };
}
