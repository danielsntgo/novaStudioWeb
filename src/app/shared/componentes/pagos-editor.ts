import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MetodoPagoOpcion } from '../../core/api/catalogos.service';
import { numero } from '../../core/api/paginas';
import { formatearMoneda } from '../formato/formato';
import { Icono } from './icono';

export interface PagoEditable {
  metodoPagoId: string;
  importe: number | null;
  referencia: string;
}

/** Lista editable de pagos (método, importe y referencia). */
@Component({
  selector: 'app-pagos-editor',
  imports: [FormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="pagos">
      @for (p of pagos(); track $index; let i = $index) {
        <li class="pago">
          <div class="fp-campo metodo">
            <label class="fp-etiqueta" [for]="'pago-metodo-' + i">Método</label>
            <select [id]="'pago-metodo-' + i" class="fp-input fp-select" [ngModel]="p.metodoPagoId" (ngModelChange)="cambiar(i, { metodoPagoId: $event })">
              <option value="">Selecciona</option>
              @for (m of metodos(); track m.id) { <option [value]="m.id">{{ m.nombre }}</option> }
            </select>
          </div>
          <div class="fp-campo importe">
            <label class="fp-etiqueta" [for]="'pago-importe-' + i">Importe</label>
            <input [id]="'pago-importe-' + i" type="number" min="0" step="any" inputmode="decimal" class="fp-input" [ngModel]="p.importe" (ngModelChange)="cambiar(i, { importe: $event })" />
          </div>
          @if (requiereReferencia(p.metodoPagoId)) {
            <div class="fp-campo referencia">
              <label class="fp-etiqueta" [for]="'pago-ref-' + i">Referencia</label>
              <input [id]="'pago-ref-' + i" type="text" class="fp-input" placeholder="N.º de transacción" [ngModel]="p.referencia" (ngModelChange)="cambiar(i, { referencia: $event })" />
            </div>
          }
          @if (pagos().length > 1 || permitirVaciar()) {
            <button type="button" class="quitar" (click)="quitar(i)" [attr.aria-label]="'Quitar pago ' + (i + 1)"><svg app-icono="cerrar" [tamano]="16"></svg></button>
          }
        </li>
      }
    </ul>
    <div class="pie">
      <button type="button" class="fp-enlace agregar" (click)="agregar()"><svg app-icono="mas" [tamano]="14"></svg> Agregar método de pago</button>
      <span class="suma">Suma: <strong>{{ formato(suma()) }}</strong></span>
    </div>
  `,
  styles: `
    .pagos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .pago { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 32px; gap: 10px; align-items: end; padding: 12px; background: #fff; border: 1px solid var(--fp-borde-suave); border-radius: 14px; }
    .referencia { grid-column: 1 / span 2; }
    .quitar { grid-column: 3; grid-row: 1; width: 32px; height: 38px; display: grid; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--fp-gris-500); cursor: pointer; }
    .quitar:hover { background: var(--fp-peligro-fondo); color: var(--fp-peligro); }
    .pie { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
    .agregar { display: inline-flex; align-items: center; gap: 6px; padding-left: 0; }
    .suma { font-size: 14px; color: var(--fp-texto-suave); }
    .suma strong { color: var(--fp-texto); }
  `,
})
export class PagosEditor {
  readonly pagos = model.required<PagoEditable[]>();
  readonly metodos = input.required<MetodoPagoOpcion[]>();
  readonly moneda = input('COP');
  readonly permitirVaciar = input(false);

  protected readonly suma = computed(() => this.pagos().reduce((s, p) => s + numero(p.importe), 0));

  protected formato(v: number): string {
    return formatearMoneda(v, this.moneda());
  }

  protected requiereReferencia(id: string): boolean {
    return this.metodos().find((m) => m.id === id)?.requiereReferencia === true;
  }

  protected cambiar(indice: number, cambios: Partial<PagoEditable>): void {
    this.pagos.update((l) => l.map((p, i) => (i === indice ? { ...p, ...cambios } : p)));
  }

  protected agregar(): void {
    this.pagos.update((l) => [...l, { metodoPagoId: '', importe: null, referencia: '' }]);
  }

  protected quitar(indice: number): void {
    this.pagos.update((l) => l.filter((_, i) => i !== indice));
  }
}

/** Primer problema de validación de una lista de pagos, o null. */
export function problemaDePagos(pagos: PagoEditable[], metodos: MetodoPagoOpcion[]): string | null {
  for (const [i, p] of pagos.entries()) {
    const n = i + 1;
    if (!p.metodoPagoId) return `Pago ${n}: selecciona el método.`;
    if (numero(p.importe) <= 0) return `Pago ${n}: el importe debe ser mayor que cero.`;
    const m = metodos.find((x) => x.id === p.metodoPagoId);
    if (m?.requiereReferencia && !p.referencia.trim()) return `Pago ${n}: este método exige una referencia.`;
  }
  return null;
}

export function pagosParaApi(pagos: PagoEditable[]) {
  return pagos.map((p) => ({ metodoPagoId: p.metodoPagoId, importe: numero(p.importe), referencia: p.referencia.trim() || null }));
}
