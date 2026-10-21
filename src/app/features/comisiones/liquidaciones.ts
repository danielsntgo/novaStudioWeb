import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { EmpleadoOpcion } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { formatearMoneda } from '../../shared/formato/formato';
import { Liquidacion } from './modelos';

@Component({
  selector: 'app-liquidaciones-comision',
  imports: [FormsModule, Icono, Tabla, Paginador],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fp-herramientas">
      <select class="fp-input fp-select filtro" aria-label="Empleado" [ngModel]="empleadoId()" (ngModelChange)="filtrar('empleado', $event)">
        <option value="">Todos los empleados</option>
        @for (e of empleados(); track e.id) { <option [value]="e.id">{{ e.nombre }}</option> }
      </select>
      <label class="fecha">Desde <input type="date" class="fp-input" [ngModel]="desde()" (ngModelChange)="filtrar('desde', $event)" /></label>
      <label class="fecha">Hasta <input type="date" class="fp-input" [ngModel]="hasta()" (ngModelChange)="filtrar('hasta', $event)" /></label>
    </div>

    @if (error(); as mensaje) { <div class="fp-alerta" role="alert"><svg app-icono="alerta" [tamano]="18"></svg><span>{{ mensaje }}</span></div> }

    <section class="fp-tarjeta fp-tarjeta--plana">
      <app-tabla [columnas]="columnas" [filas]="filas()" [cargando]="cargando()" vacioTitulo="No hay liquidaciones" vacioDetalle="Cuando pagues comisiones desde la pestaña Movimientos, quedarán registradas aquí." />
      <app-paginador [pagina]="pagina()" [tamano]="20" [total]="total()" (cambio)="irA($event)" />
    </section>
  `,
  styles: `
    .filtro { width: auto; min-width: 200px; border-radius: 999px; padding-top: 9px; padding-bottom: 9px; font-size: 14px; }
    .fecha { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--fp-gris-700); }
    .fecha .fp-input { width: auto; padding: 8px 12px; font-size: 14px; }
  `,
})
export class Liquidaciones {
  private readonly http = inject(HttpClient);

  readonly empleados = input.required<EmpleadoOpcion[]>();

  protected readonly filas = signal<Liquidacion[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly empleadoId = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly columnas: Columna<Liquidacion>[] = [
    { titulo: 'Fecha', valor: (l) => formatearFechaHora(l.fechaUtc) },
    { titulo: 'Empleado', valor: (l) => this.empleados().find((e) => e.id === l.empleadoId)?.nombre ?? 'Empleado' },
    { titulo: 'Método', valor: (l) => l.metodoPagoNombre, secundario: (l) => (l.referencia ? `Ref. ${l.referencia}` : null), ocultarEnMovil: true },
    { titulo: 'Comisiones', valor: (l) => `${l.comisionIds.length}`, alinear: 'centro', ocultarEnMovil: true },
    { titulo: 'Caja', valor: (l) => (l.esEfectivo ? 'Efectivo' : 'Otro'), insignia: (l) => ({ texto: l.esEfectivo ? 'Descontó de caja' : 'Sin efecto en caja', tono: l.esEfectivo ? 'aviso' : 'gris' }), ocultarEnMovil: true },
    { titulo: 'Pagado', valor: (l) => formatearMoneda(l.importe, l.codigoMoneda), alinear: 'derecha' },
  ];

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    const params = parametros({
      empleadoId: this.empleadoId(),
      desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
      hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
      pagina: this.pagina(),
      tamanoPagina: 20,
    });
    this.http.get<unknown>('/api/comisiones/liquidaciones', { params, context: new HttpContext().set(SILENCIAR_ERRORES, true) }).subscribe({
      next: (r) => {
        const p: Pagina<Liquidacion> = normalizarPagina<Liquidacion>(r);
        this.filas.set(p.elementos);
        this.total.set(p.total);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudieron cargar las liquidaciones.'));
      },
    });
  }

  protected filtrar(campo: 'empleado' | 'desde' | 'hasta', valor: string): void {
    if (campo === 'empleado') this.empleadoId.set(valor);
    if (campo === 'desde') this.desde.set(valor);
    if (campo === 'hasta') this.hasta.set(valor);
    this.pagina.set(1);
    this.cargar();
  }

  protected irA(p: number): void {
    this.pagina.set(p);
    this.cargar();
  }
}
