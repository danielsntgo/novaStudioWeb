import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SesionService } from '../../core/auth/sesion.service';
import { numero } from '../../core/api/paginas';
import { columnaEstado } from '../../shared/componentes/tabla';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';
import { formatearMoneda } from '../../shared/formato/formato';

export interface Servicio {
  id: string;
  nombre: string;
  descripcion?: string | null;
  categoria?: string | null;
  precio: number | string;
  codigoMoneda: string;
  duracionMinutos: number | string;
  activo: boolean;
}

function duracion(minutos: number | string): string {
  const m = numero(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

@Component({
  selector: 'app-servicios',
  imports: [ListaCrud],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-lista-crud [config]="config" />`,
})
export class Servicios {
  private readonly esAdministrador = inject(SesionService).tieneRol('Administrador');

  // El Administrador gestiona el catálogo completo; el Recepcionista solo consulta los servicios activos.
  protected readonly config: ConfigCrud<Servicio> = {
    titulo: 'Servicios',
    subtitulo: this.esAdministrador ? 'Catálogo de servicios que ofrece tu negocio.' : 'Servicios disponibles para ventas y citas.',
    textoNuevo: 'Nuevo servicio',
    singular: 'servicio',
    nombre: (s) => s.nombre,
    urlLista: this.esAdministrador ? '/api/servicios/administracion' : '/api/servicios',
    urlCrear: '/api/servicios',
    urlItem: (id) => `/api/servicios/${id}`,
    paginado: true,
    buscador: 'Buscar servicio',
    filtroActivo: this.esAdministrador,
    columnas: [
      { titulo: 'Servicio', valor: (s) => s.nombre, secundario: (s) => s.descripcion },
      { titulo: 'Categoría', valor: (s) => s.categoria ?? '—', ocultarEnMovil: true },
      { titulo: 'Duración', valor: (s) => duracion(s.duracionMinutos) },
      { titulo: 'Precio', valor: (s) => formatearMoneda(s.precio, s.codigoMoneda), alinear: 'derecha' },
      ...(this.esAdministrador ? [columnaEstado<Servicio>()] : []),
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre del servicio', tipo: 'texto', requerido: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'area' },
      { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'texto', marcador: 'Ej.: Cabello, Uñas, Barbería' },
      { nombre: 'precio', etiqueta: 'Precio', tipo: 'decimal', requerido: true, min: 0, ancho: 'medio' },
      { nombre: 'duracionMinutos', etiqueta: 'Duración (minutos)', tipo: 'numero', requerido: true, min: 1, ancho: 'medio', ayuda: 'Se usa para calcular la agenda.' },
    ],
    puedeCrear: this.esAdministrador,
    puedeEditar: this.esAdministrador,
    puedeCambiarEstado: this.esAdministrador,
    mensajeCreado: 'El servicio se creó correctamente.',
    mensajeActualizado: 'El servicio se actualizó correctamente.',
    vacio: { titulo: 'Aún no hay servicios', detalle: this.esAdministrador ? 'Crea tu primer servicio con el botón «Nuevo servicio».' : 'El administrador aún no ha creado servicios.' },
  };
}
