import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '../../shared/componentes/icono';

/** Pantalla temporal para los módulos que se construirán en fases posteriores. */
@Component({
  selector: 'app-modulo-pendiente',
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modulo-pendiente.html',
  styleUrl: './modulo-pendiente.css',
})
export class ModuloPendiente {
  // Estos valores llegan desde `data` de la ruta (withComponentInputBinding).
  readonly modulo = input('Módulo');
  readonly icono = input('caja');
  readonly fase = input(0);
  readonly backendListo = input(false);
}
