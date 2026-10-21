import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogosService, EmpleadoOpcion, MetodoPagoOpcion } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Dialogo } from '../../shared/componentes/dialogo';
import { Icono } from '../../shared/componentes/icono';
import { Paginador } from '../../shared/componentes/paginador';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';
import { ESTADOS_COMISION, MovimientoComision, TIPOS_MOVIMIENTO } from './modelos';

@Component({
  selector: 'app-movimientos-comision',
  imports: [FormsModule, Icono, Paginador, Dialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movimientos.html',
  styleUrl: './movimientos.css',
})
export class Movimientos {
  private readonly http = inject(HttpClient);
  private readonly catalogos = inject(CatalogosService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  readonly empleados = input.required<EmpleadoOpcion[]>();
  readonly liquidado = output<void>();

  protected readonly filas = signal<MovimientoComision[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly empleadoId = signal('');
  protected readonly estado = signal('Pendiente');
  protected readonly tipo = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly seleccion = signal<Set<string>>(new Set());
  protected readonly dialogo = signal(false);
  protected readonly metodos = signal<MetodoPagoOpcion[] | null | undefined>(undefined);
  protected readonly metodoId = signal('');
  protected readonly referencia = signal('');
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal<string | null>(null);

  protected readonly estados = Object.entries(ESTADOS_COMISION).map(([valor, e]) => ({ valor, texto: e.texto }));
  protected readonly estadosVisuales = ESTADOS_COMISION;
  protected readonly tiposMov = TIPOS_MOVIMIENTO;
  protected readonly dinero = (v: number | string, m = 'COP') => formatearMoneda(v, m);
  protected readonly fechaHora = formatearFechaHora;
  protected readonly cantidad = (v: number | string) => formatearCantidad(v);

  protected readonly nombreEmpleado = (id: string) => this.empleados().find((e) => e.id === id)?.nombre ?? 'Empleado';

  /** Solo los devengos pendientes de un mismo empleado se pueden liquidar juntos. */
  protected readonly seleccionados = computed(() => this.filas().filter((f) => this.seleccion().has(f.id)));
  protected readonly empleadoSeleccion = computed(() => this.seleccionados()[0]?.empleadoId ?? '');
  protected readonly totalSeleccion = computed(() => this.seleccionados().reduce((s, f) => s + numero(f.importe), 0));
  protected readonly monedaSeleccion = computed(() => this.seleccionados()[0]?.codigoMoneda ?? 'COP');
  protected readonly metodo = computed(() => this.metodos()?.find((m) => m.id === this.metodoId()));

  constructor() {
    this.cargar();
  }

  protected emptySet(): Set<string> {
    return new Set<string>();
  }

  protected esLiquidable(m: MovimientoComision): boolean {
    return m.tipoMovimiento === 'DevengoServicio' && m.estado === 'Pendiente';
  }

  protected puedeMarcar(m: MovimientoComision): boolean {
    if (!this.esLiquidable(m)) return false;
    const e = this.empleadoSeleccion();
    return e === '' || e === m.empleadoId;
  }

  protected alternar(m: MovimientoComision): void {
    this.seleccion.update((s) => {
      const nuevo = new Set(s);
      if (nuevo.has(m.id)) nuevo.delete(m.id);
      else nuevo.add(m.id);
      return nuevo;
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    const params = parametros({
      empleadoId: this.empleadoId(),
      estado: this.estado(),
      tipoMovimiento: this.tipo(),
      desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
      hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
      pagina: this.pagina(),
      tamanoPagina: 20,
    });
    this.http.get<unknown>('/api/comisiones', { ...this.silencio, params }).subscribe({
      next: (r) => {
        const p: Pagina<MovimientoComision> = normalizarPagina<MovimientoComision>(r);
        this.filas.set(p.elementos);
        this.total.set(p.total);
        this.cargando.set(false);
        this.seleccion.update((s) => new Set([...s].filter((id) => p.elementos.some((f) => f.id === id))));
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudieron cargar las comisiones.'));
      },
    });
  }

  protected filtrar(campo: 'empleado' | 'estado' | 'tipo' | 'desde' | 'hasta', valor: string): void {
    if (campo === 'empleado') this.empleadoId.set(valor);
    if (campo === 'estado') this.estado.set(valor);
    if (campo === 'tipo') this.tipo.set(valor);
    if (campo === 'desde') this.desde.set(valor);
    if (campo === 'hasta') this.hasta.set(valor);
    this.seleccion.set(new Set());
    this.pagina.set(1);
    this.cargar();
  }

  protected irA(p: number): void {
    this.pagina.set(p);
    this.cargar();
  }

  // ----- Liquidación -----
  protected abrirLiquidacion(): void {
    this.errorEnvio.set(null);
    this.referencia.set('');
    this.dialogo.set(true);
    if (this.metodos() === undefined) {
      this.catalogos.metodosPago().subscribe((m) => {
        this.metodos.set(m);
        this.metodoId.set(m?.find((x) => x.esEfectivo)?.id ?? m?.[0]?.id ?? '');
      });
    }
  }

  protected cerrarDialogo(): void {
    if (!this.enviando()) this.dialogo.set(false);
  }

  protected readonly problema = computed<string | null>(() => {
    if (!this.metodoId()) return 'Selecciona el método de pago.';
    if (this.metodo()?.requiereReferencia && !this.referencia().trim()) return 'Este método exige una referencia.';
    return null;
  });

  protected liquidar(): void {
    if (this.problema() || this.enviando()) return;
    this.enviando.set(true);
    this.errorEnvio.set(null);
    const cuerpo = { comisionIds: [...this.seleccion()], metodoPagoId: this.metodoId(), referencia: this.referencia().trim() || null };
    this.http.post('/api/comisiones/liquidaciones', cuerpo, this.silencio).subscribe({
      next: () => {
        this.enviando.set(false);
        this.dialogo.set(false);
        this.seleccion.set(new Set());
        this.notificaciones.exito('La liquidación se registró correctamente.');
        this.liquidado.emit();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.errorEnvio.set(mensajeDeError(err, 'No se pudo registrar la liquidación.'));
      },
    });
  }

  protected tono(estado: string): string {
    return this.estadosVisuales[estado]?.tono ?? 'gris';
  }
  protected textoEstado(estado: string): string {
    return this.estadosVisuales[estado]?.texto ?? estado;
  }
}
