import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icono } from '../../shared/componentes/icono';
import { NotificacionesService } from './notificaciones.service';

const ICONO_POR_TIPO = { exito: 'exito', info: 'info', aviso: 'alerta', error: 'alerta' } as const;

@Component({
  selector: 'app-notificaciones',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" aria-live="polite" aria-relevant="additions">
      @for (n of servicio.lista(); track n.id) {
        <div class="aviso" [class]="'aviso aviso--' + n.tipo" [attr.role]="n.tipo === 'error' ? 'alert' : 'status'">
          <svg class="aviso__icono" [app-icono]="iconos[n.tipo]" [tamano]="22"></svg>
          <div class="aviso__texto">
            <p class="aviso__titulo">{{ n.titulo }}</p>
            <p class="aviso__detalle">{{ n.detalle }}</p>
          </div>
          <button type="button" class="aviso__cerrar" (click)="servicio.cerrar(n.id)" aria-label="Cerrar notificación">
            <svg app-icono="cerrar" [tamano]="16"></svg>
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './notificaciones.css',
})
export class Notificaciones {
  protected readonly servicio = inject(NotificacionesService);
  protected readonly iconos = ICONO_POR_TIPO;
}
