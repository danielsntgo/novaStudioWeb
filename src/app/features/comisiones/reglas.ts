import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmpleadoOpcion } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { leerProblema, mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { CampoForm } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';
import { formatearMoneda } from '../../shared/formato/formato';
import { ReglaComision } from './modelos';

interface ServicioBasico {
  id: string;
  nombre: string;
}

@Component({
  selector: 'app-reglas-comision',
  imports: [FormsModule, Icono, Tabla, Paginador, PanelLateral, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cabecera">
      <p class="fp-texto-tenue">Una tarifa por pareja empleado–servicio. Las comisiones solo se generan cuando existe una tarifa activa.</p>
      <button type="button" class="fp-boton" (click)="abrir(null)"><svg app-icono="mas" [tamano]="18"></svg> Nueva tarifa</button>
    </div>

    <div class="fp-herramientas">
      <select class="fp-input fp-select filtro" aria-label="Empleado" [ngModel]="empleadoId()" (ngModelChange)="filtrar('empleado', $event)">
        <option value="">Todos los empleados</option>
        @for (e of empleados(); track e.id) { <option [value]="e.id">{{ e.nombre }}</option> }
      </select>
      <select class="fp-input fp-select filtro" aria-label="Servicio" [ngModel]="servicioId()" (ngModelChange)="filtrar('servicio', $event)">
        <option value="">Todos los servicios</option>
        @for (s of servicios(); track s.id) { <option [value]="s.id">{{ s.nombre }}</option> }
      </select>
    </div>

    @if (error(); as mensaje) { <div class="fp-alerta" role="alert"><svg app-icono="alerta" [tamano]="18"></svg><span>{{ mensaje }}</span></div> }

    <section class="fp-tarjeta fp-tarjeta--plana">
      <app-tabla [columnas]="columnas" [filas]="filas()" [cargando]="cargando()" vacioTitulo="No hay tarifas" vacioDetalle="Crea una tarifa para que los servicios generen comisión.">
        <ng-template #acciones let-fila>
          <button type="button" class="fp-enlace" (click)="abrir(fila)">Editar</button>
          <button type="button" class="fp-enlace" [class.fp-enlace--peligro]="fila.activa" (click)="cambiarEstado(fila)">{{ fila.activa ? 'Desactivar' : 'Activar' }}</button>
        </ng-template>
      </app-tabla>
      <app-paginador [pagina]="pagina()" [tamano]="20" [total]="total()" (cambio)="irA($event)" />
    </section>

    <app-panel-lateral [abierto]="panel() !== null" [titulo]="panel()?.regla ? 'Editar tarifa' : 'Nueva tarifa'" [subtitulo]="subtitulo()" (cerrar)="cerrar()">
      @if (panel(); as p) {
        <app-formulario-dinamico [campos]="campos()" [valorInicial]="valorInicial()" [enviando]="enviando()" [error]="errorEnvio()" [erroresServidor]="erroresCampos()" [textoGuardar]="p.regla ? 'Guardar cambios' : 'Crear tarifa'" (guardar)="guardar($event)" (cancelar)="cerrar()" />
      }
    </app-panel-lateral>
  `,
  styles: `
    .cabecera { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .filtro { width: auto; min-width: 200px; border-radius: 999px; padding-top: 9px; padding-bottom: 9px; font-size: 14px; }
  `,
})
export class Reglas {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  readonly empleados = input.required<EmpleadoOpcion[]>();
  readonly servicios = input.required<ServicioBasico[]>();

  protected readonly filas = signal<ReglaComision[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly empleadoId = signal('');
  protected readonly servicioId = signal('');

  protected readonly panel = signal<{ regla: ReglaComision | null } | null>(null);
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal<string | null>(null);
  protected readonly erroresCampos = signal<Record<string, string[]> | null>(null);

  private nombreEmpleado = (id: string) => this.empleados().find((e) => e.id === id)?.nombre ?? 'Empleado';
  private nombreServicio = (id: string) => this.servicios().find((s) => s.id === id)?.nombre ?? 'Servicio';

  protected readonly columnas: Columna<ReglaComision>[] = [
    { titulo: 'Empleado', valor: (r) => this.nombreEmpleado(r.empleadoId) },
    { titulo: 'Servicio', valor: (r) => this.nombreServicio(r.servicioId) },
    { titulo: 'Tarifa', valor: (r) => (r.tipo === 'Porcentaje' ? `${numero(r.valor)} %` : `${formatearMoneda(r.valor)} por unidad`), alinear: 'derecha' },
    { titulo: 'Estado', valor: (r) => (r.activa ? 'Activa' : 'Inactiva'), insignia: (r) => ({ texto: r.activa ? 'Activa' : 'Inactiva', tono: r.activa ? 'exito' : 'gris' }) },
  ];

  protected readonly subtitulo = computed(() => {
    const r = this.panel()?.regla;
    return r ? `${this.nombreEmpleado(r.empleadoId)} · ${this.nombreServicio(r.servicioId)}` : '';
  });

  protected readonly campos = computed<CampoForm[]>(() => {
    const nueva = !this.panel()?.regla;
    const base: CampoForm[] = [
      { nombre: 'tipo', etiqueta: 'Tipo de tarifa', tipo: 'seleccion', requerido: true, ancho: 'medio', opciones: [{ valor: 'Porcentaje', etiqueta: 'Porcentaje de la venta' }, { valor: 'ValorFijo', etiqueta: 'Valor fijo por servicio' }] },
      { nombre: 'valor', etiqueta: 'Valor', tipo: 'decimal', requerido: true, min: 0.01, ancho: 'medio', ayuda: 'Hasta dos decimales. El porcentaje máximo es 100.' },
    ];
    if (!nueva) return base;
    return [
      { nombre: 'empleadoId', etiqueta: 'Empleado', tipo: 'seleccion', requerido: true, opciones: this.empleados().map((e) => ({ valor: e.id, etiqueta: e.nombre })) },
      { nombre: 'servicioId', etiqueta: 'Servicio', tipo: 'seleccion', requerido: true, opciones: this.servicios().map((s) => ({ valor: s.id, etiqueta: s.nombre })) },
      ...base,
    ];
  });

  protected readonly valorInicial = computed<Record<string, unknown>>(() => {
    const r = this.panel()?.regla;
    return r ? { tipo: r.tipo, valor: numero(r.valor) } : { tipo: 'Porcentaje' };
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    const params = parametros({ empleadoId: this.empleadoId(), servicioId: this.servicioId(), pagina: this.pagina(), tamanoPagina: 20 });
    this.http.get<unknown>('/api/comisiones/reglas', { ...this.silencio, params }).subscribe({
      next: (r) => {
        const p: Pagina<ReglaComision> = normalizarPagina<ReglaComision>(r);
        this.filas.set(p.elementos);
        this.total.set(p.total);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudieron cargar las tarifas.'));
      },
    });
  }

  protected filtrar(campo: 'empleado' | 'servicio', valor: string): void {
    if (campo === 'empleado') this.empleadoId.set(valor);
    else this.servicioId.set(valor);
    this.pagina.set(1);
    this.cargar();
  }

  protected irA(p: number): void {
    this.pagina.set(p);
    this.cargar();
  }

  protected abrir(regla: ReglaComision | null): void {
    this.errorEnvio.set(null);
    this.erroresCampos.set(null);
    this.panel.set({ regla });
  }

  protected cerrar(): void {
    if (!this.enviando()) this.panel.set(null);
  }

  protected guardar(valor: Record<string, unknown>): void {
    const p = this.panel();
    if (!p || this.enviando()) return;
    this.enviando.set(true);
    this.errorEnvio.set(null);
    this.erroresCampos.set(null);
    const peticion = p.regla
      ? this.http.put(`/api/comisiones/reglas/${p.regla.id}`, { tipo: valor['tipo'], valor: valor['valor'] }, this.silencio)
      : this.http.post('/api/comisiones/reglas', valor, this.silencio);
    peticion.subscribe({
      next: () => {
        this.enviando.set(false);
        this.panel.set(null);
        this.notificaciones.exito(p.regla ? 'La tarifa se actualizó correctamente.' : 'La tarifa se creó correctamente.');
        this.cargar();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        const pr = leerProblema(err);
        this.erroresCampos.set(pr.errores ?? null);
        this.errorEnvio.set(pr.errores ? 'Revisa los campos marcados.' : mensajeDeError(err, 'No se pudo guardar la tarifa.'));
      },
    });
  }

  protected async cambiarEstado(r: ReglaComision): Promise<void> {
    const aceptado = await this.confirmacion.confirmar({
      titulo: r.activa ? '¿Desactivar la tarifa?' : '¿Activar la tarifa?',
      mensaje: r.activa ? 'Las nuevas ventas de este servicio dejarán de generar comisión para este empleado. Las comisiones ya generadas no cambian.' : 'Las nuevas ventas de este servicio volverán a generar comisión para este empleado.',
      textoAceptar: r.activa ? 'Desactivar' : 'Activar',
      peligro: r.activa,
    });
    if (!aceptado) return;
    this.http.patch(`/api/comisiones/reglas/${r.id}/estado`, { activa: !r.activa }, this.silencio).subscribe({
      next: () => {
        this.notificaciones.exito(r.activa ? 'La tarifa se desactivó.' : 'La tarifa se activó.');
        this.cargar();
      },
      error: (err: unknown) => this.notificaciones.error(mensajeDeError(err, 'No se pudo cambiar el estado.')),
    });
  }
}
