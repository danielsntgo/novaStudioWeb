import { TonoInsignia } from '../../shared/componentes/tabla';

export type EstadoCita = 'Pendiente' | 'Confirmada' | 'Atendida' | 'Cancelada' | 'NoAsistio';

export interface Cita {
  id: string;
  clienteId: string;
  clienteNombre: string;
  servicioId: string;
  servicioNombre: string;
  empleadoId: string;
  empleadoNombre: string;
  inicioUtc: string;
  finUtc: string;
  duracionMinutos: number | string;
  estado: EstadoCita | string;
}

export const ESTADOS_CITA: Record<string, { texto: string; tono: TonoInsignia }> = {
  Pendiente: { texto: 'Pendiente', tono: 'aviso' },
  Confirmada: { texto: 'Confirmada', tono: 'azul' },
  Atendida: { texto: 'Atendida', tono: 'exito' },
  Cancelada: { texto: 'Cancelada', tono: 'gris' },
  NoAsistio: { texto: 'No asistió', tono: 'peligro' },
};

export interface TransicionCita {
  estado: EstadoCita;
  texto: string;
  peligro?: boolean;
  confirmar?: string;
}

/** Transiciones permitidas por el backend. Los estados finales no se reabren. */
export const TRANSICIONES: Record<string, TransicionCita[]> = {
  Pendiente: [
    { estado: 'Confirmada', texto: 'Confirmar cita' },
    { estado: 'Atendida', texto: 'Marcar como atendida' },
    { estado: 'NoAsistio', texto: 'No asistió', peligro: true, confirmar: 'La cita se marcará como «No asistió» y ya no se podrá cambiar.' },
    { estado: 'Cancelada', texto: 'Cancelar cita', peligro: true, confirmar: 'La cita se cancelará, el horario quedará libre y ya no se podrá reabrir.' },
  ],
  Confirmada: [
    { estado: 'Atendida', texto: 'Marcar como atendida' },
    { estado: 'NoAsistio', texto: 'No asistió', peligro: true, confirmar: 'La cita se marcará como «No asistió» y ya no se podrá cambiar.' },
    { estado: 'Cancelada', texto: 'Cancelar cita', peligro: true, confirmar: 'La cita se cancelará, el horario quedará libre y ya no se podrá reabrir.' },
  ],
};

export function puedeReprogramar(estado: string): boolean {
  return estado === 'Pendiente' || estado === 'Confirmada';
}
