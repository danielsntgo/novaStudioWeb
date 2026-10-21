import { Observable } from 'rxjs';
import { Columna } from '../componentes/tabla';
import { CampoForm, OpcionCampo } from '../formularios/campos';

export interface FiltroCrud {
  /** Nombre del parámetro de consulta que se envía a la API. */
  nombre: string;
  etiqueta: string;
  tipo: 'seleccion' | 'casilla';
  opciones?: OpcionCampo[];
}

/** Acción extra en cada fila. Con `formulario` abre un panel con ese formulario; sin él, emite un evento. */
export interface AccionFila<T> {
  id: string;
  etiqueta: string;
  visible?: (fila: T) => boolean;
  formulario?: {
    titulo: (fila: T) => string;
    subtitulo?: (fila: T) => string;
    campos: CampoForm[];
    valorInicial?: (fila: T) => Record<string, unknown>;
    enviar: (fila: T, valor: Record<string, unknown>) => Observable<unknown>;
    mensajeExito: string;
    textoGuardar?: string;
  };
}

/** Configuración de una pantalla de listado con alta, edición y cambio de estado. */
export interface ConfigCrud<T extends { id: string; activo?: boolean }> {
  titulo: string;
  subtitulo: string;
  /** Texto del botón de alta, por ejemplo "Nuevo cliente". */
  textoNuevo: string;
  /** Nombre en singular para mensajes: "cliente". */
  singular: string;
  nombre: (fila: T) => string;

  urlLista: string;
  urlCrear?: string;
  urlItem?: (id: string) => string;
  urlEstado?: (id: string) => string;
  paginado: boolean;
  tamanoPagina?: number;

  /** Marcador del buscador. Si no se define, no hay buscador. */
  buscador?: string;
  /** Muestra el selector Activos / Inactivos y envía `activo` a la API. */
  filtroActivo: boolean;
  filtros?: FiltroCrud[];

  columnas: Columna<T>[];
  campos: CampoForm[];
  aFormulario?: (fila: T) => Record<string, unknown>;

  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeCambiarEstado: boolean;
  acciones?: AccionFila<T>[];

  mensajeCreado: string;
  mensajeActualizado: string;
  vacio: { titulo: string; detalle: string };
  anchoPanel?: 'normal' | 'ancho';
  /** true si se muestra dentro de otra pantalla (pestañas): sin título grande ni márgenes de página. */
  incrustado?: boolean;
}
