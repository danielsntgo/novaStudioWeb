import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icono } from './icono';

/** Campo de contraseña con botón para mostrar u ocultar el texto. Compatible con Reactive Forms. */
@Component({
  selector: 'app-campo-contrasena',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CampoContrasena), multi: true }],
  template: `
    <div class="envoltorio">
      <input
        class="fp-input"
        [id]="inputId()"
        [type]="visible() ? 'text' : 'password'"
        [value]="valor()"
        [disabled]="deshabilitado()"
        [attr.autocomplete]="autocomplete()"
        [attr.placeholder]="placeholder() || null"
        (input)="alEscribir($event)"
        (blur)="alSalir()"
      />
      <button
        type="button"
        class="ojo"
        (click)="visible.set(!visible())"
        [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        [attr.aria-pressed]="visible()"
        tabindex="0"
      >
        <svg [app-icono]="visible() ? 'ojo-tachado' : 'ojo'" [tamano]="18"></svg>
      </button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .envoltorio { position: relative; }
    .fp-input { padding-right: 46px; }
    .ojo {
      position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
      width: 34px; height: 34px; display: grid; place-items: center;
      border: 0; border-radius: 9px; background: transparent; color: var(--fp-gris-500); cursor: pointer;
    }
    .ojo:hover { background: rgba(0, 0, 0, 0.05); color: var(--fp-gris-800); }
  `,
})
export class CampoContrasena implements ControlValueAccessor {
  readonly inputId = input('');
  readonly autocomplete = input('current-password');
  readonly placeholder = input('');

  protected readonly valor = signal('');
  protected readonly visible = signal(false);
  protected readonly deshabilitado = signal(false);

  private alCambiar: (valor: string) => void = () => {};
  private alTocar: () => void = () => {};

  writeValue(valor: string | null): void {
    this.valor.set(valor ?? '');
  }
  registerOnChange(fn: (valor: string) => void): void {
    this.alCambiar = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.alTocar = fn;
  }
  setDisabledState(deshabilitado: boolean): void {
    this.deshabilitado.set(deshabilitado);
  }

  protected alEscribir(evento: Event): void {
    const texto = (evento.target as HTMLInputElement).value;
    this.valor.set(texto);
    this.alCambiar(texto);
  }

  protected alSalir(): void {
    this.alTocar();
  }
}
