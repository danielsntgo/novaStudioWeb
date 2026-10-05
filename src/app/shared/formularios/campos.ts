export type TipoCampo = 'texto' | 'email' | 'telefono' | 'numero' | 'decimal' | 'area' | 'seleccion' | 'casilla' | 'fecha' | 'hora';

export interface OpcionCampo {
  valor: string;
  etiqueta: string;
}

/** Descripción de un campo de formulario. Con una lista de estos se arma un formulario completo. */
export interface CampoForm {
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  maximo?: number;
  min?: number;
  paso?: number;
  opciones?: OpcionCampo[];
  marcador?: string;
  ayuda?: string;
  ancho?: 'completo' | 'medio';
  valorPorDefecto?: unknown;
  deshabilitado?: boolean;
  /** El campo solo aparece (y se valida) cuando esta función devuelve true. */
  visibleSi?: (valor: Record<string, unknown>) => boolean;
  mayusculas?: boolean;
}
