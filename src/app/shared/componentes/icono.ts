import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input } from '@angular/core';
import { ICONOS } from './iconos';

/** Uso: <svg app-icono="calendario" [tamano]="18"></svg> */
@Component({
  selector: 'svg[app-icono]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    '[attr.width]': 'tamano()',
    '[attr.height]': 'tamano()',
    style: 'display:inline-block;flex:none;vertical-align:middle',
  },
})
export class Icono {
  readonly nombre = input.required<string>({ alias: 'app-icono' });
  readonly tamano = input(18);

  private readonly elemento = inject<ElementRef<SVGElement>>(ElementRef);

  constructor() {
    effect(() => {
      // Contenido estático definido en iconos.ts (no proviene del usuario ni de la red).
      this.elemento.nativeElement.innerHTML = ICONOS[this.nombre()] ?? '';
    });
  }
}
