import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icono } from './icono';

@Component({
  selector: 'app-paginador',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <nav class="paginador" aria-label="Paginación">
        <span class="resumen">{{ desde() }}–{{ hasta() }} de {{ total() }}</span>
        <div class="botones">
          <button type="button" (click)="cambio.emit(pagina() - 1)" [disabled]="pagina() <= 1" aria-label="Página anterior">
            <svg app-icono="flecha-izquierda" [tamano]="16"></svg>
          </button>
          <span class="actual">Página {{ pagina() }} de {{ paginas() }}</span>
          <button type="button" (click)="cambio.emit(pagina() + 1)" [disabled]="pagina() >= paginas()" aria-label="Página siguiente">
            <svg app-icono="flecha-derecha" [tamano]="16"></svg>
          </button>
        </div>
      </nav>
    }
  `,
  styles: `
    .paginador { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--fp-borde-suave); font-size: 13.5px; color: var(--fp-texto-suave); }
    .botones { display: flex; align-items: center; gap: 10px; }
    button { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--fp-borde); border-radius: 10px; background: #fff; color: var(--fp-gris-800); cursor: pointer; }
    button:hover:not(:disabled) { background: var(--fp-azul-50); border-color: var(--fp-azul-200); color: var(--fp-azul-700); }
    button:disabled { opacity: 0.4; cursor: default; }
    @media (max-width: 560px) { .actual { display: none; } }
  `,
})
export class Paginador {
  readonly pagina = input.required<number>();
  readonly tamano = input.required<number>();
  readonly total = input.required<number>();
  readonly cambio = output<number>();

  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / this.tamano())));
  protected readonly desde = computed(() => (this.pagina() - 1) * this.tamano() + 1);
  protected readonly hasta = computed(() => Math.min(this.total(), this.pagina() * this.tamano()));
}
