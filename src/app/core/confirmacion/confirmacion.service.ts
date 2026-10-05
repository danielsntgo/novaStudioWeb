import { Injectable, signal } from '@angular/core';

export interface OpcionesConfirmacion {
  titulo: string;
  mensaje: string;
  textoAceptar?: string;
  textoCancelar?: string;
  /** Resalta el botón en rojo (acciones destructivas o difíciles de revertir). */
  peligro?: boolean;
}

interface EstadoConfirmacion extends OpcionesConfirmacion {
  resolver: (aceptado: boolean) => void;
}

/** Ventana de confirmación reutilizable: `if (await confirmacion.confirmar({...})) { ... }`. */
@Injectable({ providedIn: 'root' })
export class ConfirmacionService {
  private readonly _estado = signal<EstadoConfirmacion | null>(null);
  readonly estado = this._estado.asReadonly();

  confirmar(opciones: OpcionesConfirmacion): Promise<boolean> {
    return new Promise<boolean>((resolver) => {
      // Si ya había una abierta, se cancela.
      this._estado()?.resolver(false);
      this._estado.set({ ...opciones, resolver });
    });
  }

  responder(aceptado: boolean): void {
    const actual = this._estado();
    this._estado.set(null);
    actual?.resolver(aceptado);
  }
}
