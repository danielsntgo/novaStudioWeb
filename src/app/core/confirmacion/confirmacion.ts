import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Dialogo } from '../../shared/componentes/dialogo';
import { ConfirmacionService } from './confirmacion.service';

@Component({
  selector: 'app-confirmacion',
  imports: [Dialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.botones { display: contents; }`,
  template: `
    @let e = servicio.estado();
    <app-dialogo [abierto]="e !== null" [titulo]="e?.titulo ?? ''" [conCierre]="false" (cerrar)="servicio.responder(false)">
      <p>{{ e?.mensaje }}</p>
      <div pie class="botones">
        <button type="button" class="fp-boton fp-boton--secundario" (click)="servicio.responder(false)">
          {{ e?.textoCancelar ?? 'Cancelar' }}
        </button>
        <button type="button" class="fp-boton" [class.fp-boton--peligro]="e?.peligro" (click)="servicio.responder(true)">
          {{ e?.textoAceptar ?? 'Aceptar' }}
        </button>
      </div>
    </app-dialogo>
  `,
})
export class Confirmacion {
  protected readonly servicio = inject(ConfirmacionService);
}
