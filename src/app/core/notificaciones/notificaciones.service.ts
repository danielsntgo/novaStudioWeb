import { Injectable, signal } from '@angular/core';

export type TipoNotificacion = 'exito' | 'info' | 'aviso' | 'error';

export interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  titulo: string;
  detalle: string;
}

/** Notificaciones (toasts) en español para toda la aplicación. */
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private siguienteId = 1;
  private readonly _lista = signal<Notificacion[]>([]);
  readonly lista = this._lista.asReadonly();

  exito(detalle: string, titulo = 'Listo'): void {
    this.mostrar('exito', titulo, detalle, 4000);
  }
  info(detalle: string, titulo = 'Información'): void {
    this.mostrar('info', titulo, detalle, 5000);
  }
  aviso(detalle: string, titulo = 'Atención'): void {
    this.mostrar('aviso', titulo, detalle, 6000);
  }
  error(detalle: string, titulo = 'Algo salió mal'): void {
    this.mostrar('error', titulo, detalle, 7000);
  }

  cerrar(id: number): void {
    this._lista.update((lista) => lista.filter((n) => n.id !== id));
  }

  private mostrar(tipo: TipoNotificacion, titulo: string, detalle: string, duracionMs: number): void {
    const id = this.siguienteId++;
    // Máximo 4 a la vez: se descartan las más antiguas.
    this._lista.update((lista) => [...lista, { id, tipo, titulo, detalle }].slice(-4));
    setTimeout(() => this.cerrar(id), duracionMs);
  }
}
