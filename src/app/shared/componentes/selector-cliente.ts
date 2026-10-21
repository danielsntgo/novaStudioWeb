import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, parametros } from '../../core/api/paginas';
import { Icono } from './icono';

export interface ClienteOpcion {
  id: string;
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
}

let contador = 0;

/** Buscador de clientes con lista desplegable. `valor` es el cliente elegido (o null). */
@Component({
  selector: 'app-selector-cliente',
  imports: [FormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor">
      <input
        [id]="inputId()"
        type="search"
        class="fp-input"
        [placeholder]="marcador()"
        autocomplete="off"
        role="combobox"
        [attr.aria-expanded]="abierta()"
        [attr.aria-controls]="listaId"
        [ngModel]="texto()"
        (ngModelChange)="escribir($event)"
        (focus)="abierta.set(texto().length >= 2 && !valor())"
        (blur)="cerrarConDemora()"
      />
      @if (valor()) {
        <button type="button" class="limpiar" (click)="limpiar()" aria-label="Quitar cliente"><svg app-icono="cerrar" [tamano]="14"></svg></button>
      }
      @if (abierta() && !valor()) {
        <ul class="opciones" role="listbox" [id]="listaId">
          @if (buscando()) {
            <li class="aviso">Buscando…</li>
          } @else {
            @for (c of resultados(); track c.id) {
              <li role="option">
                <button type="button" (mousedown)="elegir(c)">
                  <span class="nombre">{{ c.nombre }}</span>
                  <span class="detalle">{{ c.documento || c.telefono || '' }}</span>
                </button>
              </li>
            } @empty {
              <li class="aviso">Sin resultados.</li>
            }
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .contenedor { position: relative; }
    .limpiar { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--fp-gris-500); cursor: pointer; }
    .limpiar:hover { background: rgba(0, 0, 0, 0.06); }
    .opciones { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px); margin: 0; padding: 6px; list-style: none; max-height: 250px; overflow-y: auto; background: #fff; border-radius: 14px; border: 1px solid var(--fp-borde-suave); box-shadow: var(--fp-sombra-l); }
    .opciones button { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 9px 12px; border: 0; border-radius: 10px; background: transparent; text-align: left; font: inherit; cursor: pointer; }
    .opciones button:hover { background: var(--fp-azul-50); }
    .nombre { font-weight: 500; font-size: 14.5px; }
    .detalle { font-size: 12.5px; color: var(--fp-gris-500); }
    .aviso { padding: 10px 12px; font-size: 13.5px; color: var(--fp-texto-suave); }
  `,
})
export class SelectorCliente {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly valor = model<ClienteOpcion | null>(null);
  readonly inputId = input('selector-cliente');
  readonly marcador = input('Buscar cliente por nombre, documento o teléfono');

  protected readonly listaId = `lista-clientes-${++contador}`;
  protected readonly texto = signal('');
  protected readonly resultados = signal<ClienteOpcion[]>([]);
  protected readonly buscando = signal(false);
  protected readonly abierta = signal(false);
  private readonly busquedas$ = new Subject<string>();

  constructor() {
    this.busquedas$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((t) => {
          if (t.trim().length < 2) {
            this.buscando.set(false);
            return of(null);
          }
          this.buscando.set(true);
          return this.http
            .get<unknown>('/api/clientes', { context: new HttpContext().set(SILENCIAR_ERRORES, true), params: parametros({ buscar: t.trim(), activo: true, tamanoPagina: 6 }) })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        this.buscando.set(false);
        this.resultados.set(r ? normalizarPagina<ClienteOpcion>(r).elementos : []);
      });
  }

  protected escribir(t: string): void {
    this.texto.set(t);
    this.valor.set(null);
    this.abierta.set(t.length >= 2);
    this.busquedas$.next(t);
  }

  protected elegir(c: ClienteOpcion): void {
    this.valor.set(c);
    this.texto.set(c.nombre);
    this.abierta.set(false);
  }

  protected limpiar(): void {
    this.valor.set(null);
    this.texto.set('');
    this.resultados.set([]);
  }

  protected cerrarConDemora(): void {
    setTimeout(() => this.abierta.set(false), 150);
  }
}
