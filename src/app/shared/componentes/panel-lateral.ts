import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, input, output, viewChild } from '@angular/core';
import { Icono } from './icono';

/** Panel que se desliza desde la derecha, para formularios y detalles. */
@Component({
  selector: 'app-panel-lateral',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (abierto()) {
      <div class="velo" (click)="cerrar.emit()"></div>
      <aside class="panel" [class.ancho]="ancho() === 'ancho'" role="dialog" aria-modal="true" [attr.aria-label]="titulo()" tabindex="-1" #panel>
        <header class="encabezado">
          <div>
            <h2>{{ titulo() }}</h2>
            @if (subtitulo()) { <p>{{ subtitulo() }}</p> }
          </div>
          <button type="button" class="cerrar" (click)="cerrar.emit()" aria-label="Cerrar panel">
            <svg app-icono="cerrar" [tamano]="18"></svg>
          </button>
        </header>
        <div class="cuerpo"><ng-content /></div>
      </aside>
    }
  `,
  styles: `
    .velo { position: fixed; inset: 0; z-index: 800; background: rgba(0, 0, 0, 0.28); animation: aparecer 200ms ease-out; }
    .panel {
      position: fixed; z-index: 801; top: 0; right: 0; bottom: 0; width: min(480px, 100vw);
      display: flex; flex-direction: column; outline: none;
      background: rgba(250, 250, 252, 0.98); -webkit-backdrop-filter: var(--fp-desenfoque); backdrop-filter: var(--fp-desenfoque);
      box-shadow: -12px 0 48px rgba(15, 63, 122, 0.18); border-left: 1px solid var(--fp-borde-suave);
      animation: deslizar 280ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .panel.ancho { width: min(760px, 100vw); }
    @keyframes aparecer { from { opacity: 0; } }
    @keyframes deslizar { from { transform: translateX(100%); } }
    .encabezado { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 22px 24px 16px; border-bottom: 1px solid var(--fp-borde-suave); }
    .encabezado h2 { font-size: 20px; font-weight: 650; letter-spacing: -0.025em; }
    .encabezado p { margin-top: 2px; font-size: 13.5px; color: var(--fp-texto-suave); }
    .cerrar { flex: none; width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 10px; background: rgba(0, 0, 0, 0.05); color: var(--fp-gris-700); cursor: pointer; }
    .cerrar:hover { background: rgba(0, 0, 0, 0.09); }
    .cuerpo { flex: 1; overflow-y: auto; padding: 20px 24px 28px; }
  `,
})
export class PanelLateral {
  readonly abierto = input(false);
  readonly titulo = input('');
  readonly subtitulo = input('');
  readonly ancho = input<'normal' | 'ancho'>('normal');
  readonly cerrar = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    effect(() => {
      const el = this.panel()?.nativeElement;
      if (el) queueMicrotask(() => el.focus());
    });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    if (this.abierto()) this.cerrar.emit();
  }
}
