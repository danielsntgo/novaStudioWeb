import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, input, output, viewChild } from '@angular/core';
import { Icono } from './icono';

/** Ventana centrada (modal) para confirmaciones y mensajes cortos. */
@Component({
  selector: 'app-dialogo',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (abierto()) {
      <div class="velo" (click)="cerrar.emit()"></div>
      <div class="dialogo" role="dialog" aria-modal="true" [attr.aria-label]="titulo()" tabindex="-1" #contenedor>
        <header class="encabezado">
          <h2>{{ titulo() }}</h2>
          @if (conCierre()) {
            <button type="button" class="cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              <svg app-icono="cerrar" [tamano]="18"></svg>
            </button>
          }
        </header>
        <div class="cuerpo"><ng-content /></div>
        <footer class="pie"><ng-content select="[pie]" /></footer>
      </div>
    }
  `,
  styles: `
    .velo { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, 0.32); animation: aparecer 180ms ease-out; }
    .dialogo {
      position: fixed; z-index: 901; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
      background: rgba(255, 255, 255, 0.97); border-radius: 22px; box-shadow: var(--fp-sombra-l);
      border: 1px solid var(--fp-borde-suave); animation: emerger 220ms cubic-bezier(0.32, 0.72, 0, 1); outline: none;
    }
    @keyframes aparecer { from { opacity: 0; } }
    @keyframes emerger { from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); } }
    .encabezado { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 22px 24px 4px; }
    .encabezado h2 { font-size: 19px; font-weight: 650; letter-spacing: -0.02em; }
    .cerrar { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--fp-gris-500); cursor: pointer; }
    .cerrar:hover { background: rgba(0, 0, 0, 0.06); }
    .cuerpo { padding: 8px 24px 4px; color: var(--fp-gris-700); font-size: 15px; }
    .pie { display: flex; justify-content: flex-end; gap: 10px; padding: 18px 24px 22px; }
    .pie:empty { display: none; }
  `,
})
export class Dialogo {
  readonly abierto = input(false);
  readonly titulo = input('');
  readonly conCierre = input(true);
  readonly cerrar = output<void>();

  private readonly contenedor = viewChild<ElementRef<HTMLElement>>('contenedor');

  constructor() {
    effect(() => {
      const el = this.contenedor()?.nativeElement;
      if (el) queueMicrotask(() => el.focus());
    });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    if (this.abierto()) this.cerrar.emit();
  }
}
