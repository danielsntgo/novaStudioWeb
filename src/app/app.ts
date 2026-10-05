import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Confirmacion } from './core/confirmacion/confirmacion';
import { Notificaciones } from './core/notificaciones/notificaciones';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Notificaciones, Confirmacion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-notificaciones />
    <app-confirmacion />
  `,
})
export class App {}
