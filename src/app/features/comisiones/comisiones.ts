import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogosService, EmpleadoOpcion } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, parametros } from '../../core/api/paginas';
import { Reglas } from './reglas';
import { Movimientos } from './movimientos';
import { Liquidaciones } from './liquidaciones';

type Pestana = 'movimientos' | 'liquidaciones' | 'reglas';

export interface ServicioBasico {
  id: string;
  nombre: string;
}

@Component({
  selector: 'app-comisiones',
  imports: [FormsModule, Movimientos, Liquidaciones, Reglas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fp-pagina">
      <header class="fp-pagina__cabecera">
        <div>
          <h1 class="fp-pagina__titulo">Comisiones</h1>
          <p class="fp-pagina__subtitulo">Tarifas por empleado y servicio, comisiones generadas y pagos.</p>
        </div>
      </header>

      <div class="fp-segmento pestanas" role="tablist" aria-label="Secciones de comisiones">
        @for (p of pestanas; track p.id) {
          <button type="button" role="tab" [class.activo]="pestana() === p.id" [attr.aria-selected]="pestana() === p.id" (click)="pestana.set(p.id)">{{ p.titulo }}</button>
        }
      </div>

      @switch (pestana()) {
        @case ('movimientos') { <app-movimientos-comision [empleados]="empleados()" (liquidado)="pestana.set('liquidaciones')" /> }
        @case ('liquidaciones') { <app-liquidaciones-comision [empleados]="empleados()" /> }
        @case ('reglas') { <app-reglas-comision [empleados]="empleados()" [servicios]="servicios()" /> }
      }
    </div>
  `,
  styles: `.pestanas { margin-bottom: 24px; max-width: 100%; overflow-x: auto; } .pestanas button { white-space: nowrap; }`,
})
export class Comisiones implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly catalogos = inject(CatalogosService);

  protected readonly pestana = signal<Pestana>('movimientos');
  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'movimientos', titulo: 'Movimientos' },
    { id: 'liquidaciones', titulo: 'Liquidaciones' },
    { id: 'reglas', titulo: 'Tarifas' },
  ];
  protected readonly empleados = signal<EmpleadoOpcion[]>([]);
  protected readonly servicios = signal<ServicioBasico[]>([]);

  ngOnInit(): void {
    this.catalogos.empleados().subscribe((e) => this.empleados.set(e ?? []));
    this.http
      .get<unknown>('/api/servicios/administracion', { context: new HttpContext().set(SILENCIAR_ERRORES, true), params: parametros({ tamanoPagina: 100 }) })
      .subscribe({ next: (r) => this.servicios.set(normalizarPagina<ServicioBasico>(r).elementos) });
  }

  protected readonly nada = computed(() => 0);
}
