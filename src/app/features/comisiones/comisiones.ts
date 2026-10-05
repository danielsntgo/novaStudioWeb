import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, map } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla, TonoInsignia } from '../../shared/componentes/tabla';
import { CampoForm, OpcionCampo } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';
import { formatearMoneda } from '../../shared/formato/formato';

type Pestana = 'movimientos' | 'reglas' | 'liquidaciones';

interface Empleado {
  id: string;
  nombre: string;
}

interface Servicio {
  id: string;
  nombre: string;
}

interface MetodoPago {
  id: string;
  nombre: string;
  activo: boolean;
}

interface Comision {
  id: string;
  empleadoId: string;
  servicioId: string;
  ventaId: string;
  tipoMovimiento: 'DevengoServicio' | 'AjusteDevolucion' | string;
  tipoTarifa: 'Porcentaje' | 'ValorFijo' | string;
  valorTarifa: number | string;
  baseCalculo: number | string;
  cantidad: number | string;
  importe: number | string;
  codigoMoneda: string;
  estado: 'Pendiente' | 'Pagada' | 'Revertida' | string;
  liquidacionComisionId?: string | null;
  fechaCreacionUtc: string;
}

interface ReglaComision {
  id: string;
  empleadoId: string;
  servicioId: string;
  tipo: 'Porcentaje' | 'ValorFijo' | string;
  valor: number | string;
  activa: boolean;
  fechaCreacionUtc: string;
}

interface LiquidacionComision {
  id: string;
  empleadoId: string;
  metodoPagoId: string;
  metodoPagoNombre: string;
  esEfectivo: boolean;
  importe: number | string;
  codigoMoneda: string;
  referencia?: string | null;
  fechaUtc: string;
  comisionIds: string[];
}

type Panel = { tipo: 'regla'; regla: ReglaComision | null } | { tipo: 'liquidacion' } | null;

const SILENCIO = () => new HttpContext().set(SILENCIAR_ERRORES, true);

@Component({
  selector: 'app-comisiones',
  imports: [FormsModule, Icono, Tabla, Paginador, PanelLateral, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comisiones.html',
  styleUrl: './comisiones.css',
})
export class Comisiones implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);

  protected readonly pestana = signal<Pestana>('movimientos');
  protected readonly empleados = signal<Empleado[]>([]);
  protected readonly servicios = signal<Servicio[]>([]);
  protected readonly metodos = signal<MetodoPago[]>([]);

  protected readonly movimientos = signal<Comision[]>([]);
  protected readonly totalMovimientos = signal(0);
  protected readonly paginaMovimientos = signal(1);
  protected readonly cargandoMovimientos = signal(true);
  protected readonly errorMovimientos = signal<string | null>(null);

  protected readonly reglas = signal<ReglaComision[]>([]);
  protected readonly totalReglas = signal(0);
  protected readonly paginaReglas = signal(1);
  protected readonly cargandoReglas = signal(true);
  protected readonly errorReglas = signal<string | null>(null);

  protected readonly liquidaciones = signal<LiquidacionComision[]>([]);
  protected readonly totalLiquidaciones = signal(0);
  protected readonly paginaLiquidaciones = signal(1);
  protected readonly cargandoLiquidaciones = signal(true);
  protected readonly errorLiquidaciones = signal<string | null>(null);

  protected readonly filtroEmpleadoId = signal('');
  protected readonly filtroServicioId = signal('');
  protected readonly estado = signal('');
  protected readonly tipoMovimiento = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly seleccionados = signal<Set<string>>(new Set());

  protected readonly panel = signal<Panel>(null);
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal<string | null>(null);

  protected readonly columnasMovimientos: Columna<Comision>[] = [
    { titulo: 'Fecha', valor: (c) => formatearFechaHora(c.fechaCreacionUtc) },
    { titulo: 'Empleado', valor: (c) => this.nombreEmpleado(c.empleadoId), secundario: (c) => this.nombreServicio(c.servicioId) },
    {
      titulo: 'Movimiento',
      valor: (c) => c.tipoMovimiento,
      insignia: (c) => ({ texto: c.tipoMovimiento === 'DevengoServicio' ? 'Devengo' : 'Ajuste', tono: c.tipoMovimiento === 'DevengoServicio' ? 'azul' : 'aviso' }),
    },
    {
      titulo: 'Estado',
      valor: (c) => c.estado,
      insignia: (c) => ({ texto: c.estado, tono: this.tonoEstado(c.estado) }),
    },
    { titulo: 'Importe', valor: (c) => formatearMoneda(c.importe, c.codigoMoneda), alinear: 'derecha' },
  ];

  protected readonly columnasReglas: Columna<ReglaComision>[] = [
    { titulo: 'Empleado', valor: (r) => this.nombreEmpleado(r.empleadoId), secundario: (r) => this.nombreServicio(r.servicioId) },
    { titulo: 'Tipo', valor: (r) => (r.tipo === 'Porcentaje' ? 'Porcentaje' : 'Valor fijo') },
    { titulo: 'Valor', valor: (r) => (r.tipo === 'Porcentaje' ? `${r.valor} %` : formatearMoneda(r.valor)), alinear: 'derecha' },
    {
      titulo: 'Estado',
      valor: (r) => (r.activa ? 'Activa' : 'Inactiva'),
      insignia: (r) => ({ texto: r.activa ? 'Activa' : 'Inactiva', tono: r.activa ? 'exito' : 'gris' }),
    },
  ];

  protected readonly columnasLiquidaciones: Columna<LiquidacionComision>[] = [
    { titulo: 'Fecha', valor: (l) => formatearFechaHora(l.fechaUtc) },
    { titulo: 'Empleado', valor: (l) => this.nombreEmpleado(l.empleadoId), secundario: (l) => `${l.comisionIds.length} movimientos` },
    { titulo: 'Método', valor: (l) => l.metodoPagoNombre, secundario: (l) => l.referencia },
    { titulo: 'Importe', valor: (l) => formatearMoneda(l.importe, l.codigoMoneda), alinear: 'derecha' },
  ];

  protected readonly opcionesEmpleados = computed<OpcionCampo[]>(() => this.empleados().map((e) => ({ valor: e.id, etiqueta: e.nombre })));
  protected readonly opcionesServicios = computed<OpcionCampo[]>(() => this.servicios().map((s) => ({ valor: s.id, etiqueta: s.nombre })));
  protected readonly opcionesMetodos = computed<OpcionCampo[]>(() => this.metodos().filter((m) => m.activo).map((m) => ({ valor: m.id, etiqueta: m.nombre })));

  protected readonly totalSeleccionado = computed(() => {
    const ids = this.seleccionados();
    return this.movimientos()
      .filter((m) => ids.has(m.id))
      .reduce((suma, m) => suma + (m.tipoMovimiento === 'AjusteDevolucion' ? -numero(m.importe) : numero(m.importe)), 0);
  });

  protected readonly tituloPanel = computed(() => {
    const p = this.panel();
    if (p?.tipo === 'regla') return p.regla ? 'Editar regla' : 'Nueva regla';
    if (p?.tipo === 'liquidacion') return 'Liquidar comisiones';
    return '';
  });

  protected readonly camposPanel = computed<CampoForm[]>(() => {
    const p = this.panel();
    if (p?.tipo === 'liquidacion') {
      return [
        { nombre: 'metodoPagoId', etiqueta: 'Método de pago', tipo: 'seleccion', requerido: true, opciones: this.opcionesMetodos() },
        { nombre: 'referencia', etiqueta: 'Referencia', tipo: 'texto' },
      ];
    }
    if (p?.tipo === 'regla') {
      const base: CampoForm[] = [
        { nombre: 'tipo', etiqueta: 'Tipo de tarifa', tipo: 'seleccion', requerido: true, opciones: [{ valor: 'Porcentaje', etiqueta: 'Porcentaje' }, { valor: 'ValorFijo', etiqueta: 'Valor fijo' }] },
        { nombre: 'valor', etiqueta: 'Valor', tipo: 'decimal', requerido: true, min: 0 },
      ];
      if (p.regla) return base;
      return [
        { nombre: 'empleadoId', etiqueta: 'Empleado', tipo: 'seleccion', requerido: true, opciones: this.opcionesEmpleados() },
        { nombre: 'servicioId', etiqueta: 'Servicio', tipo: 'seleccion', requerido: true, opciones: this.opcionesServicios() },
        ...base,
      ];
    }
    return [];
  });

  protected readonly valorInicialPanel = computed<Record<string, unknown>>(() => {
    const p = this.panel();
    return p?.tipo === 'regla' && p.regla ? { tipo: p.regla.tipo, valor: p.regla.valor } : {};
  });

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarTodo();
  }

  protected cargarCatalogos(): void {
    forkJoin({
      empleados: this.lista<Empleado>('/api/empleados', { activo: true, tamanoPagina: 100 }),
      servicios: this.lista<Servicio>('/api/servicios/administracion', { activo: true, tamanoPagina: 100 }),
      metodos: this.lista<MetodoPago>('/api/configuracion/metodos-pago', {}),
    }).subscribe({
      next: (r) => {
        this.empleados.set(r.empleados);
        this.servicios.set(r.servicios);
        this.metodos.set(r.metodos);
      },
    });
  }

  private lista<T>(url: string, filtros: Record<string, string | number | boolean>) {
    return this.http.get<unknown>(url, { context: SILENCIO(), params: parametros(filtros) }).pipe(map((r) => normalizarPagina<T>(r, 100).elementos));
  }

  protected cargarTodo(): void {
    this.cargarMovimientos();
    this.cargarReglas();
    this.cargarLiquidaciones();
  }

  protected cargarMovimientos(): void {
    this.cargandoMovimientos.set(true);
    this.errorMovimientos.set(null);
    this.http
      .get<unknown>('/api/comisiones', {
        context: SILENCIO(),
        params: parametros({
          empleadoId: this.filtroEmpleadoId(),
          estado: this.estado(),
          tipoMovimiento: this.tipoMovimiento(),
          desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
          hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
          pagina: this.paginaMovimientos(),
          tamanoPagina: 20,
        }),
      })
      .subscribe({
        next: (r) => {
          const p: Pagina<Comision> = normalizarPagina<Comision>(r);
          this.movimientos.set(p.elementos);
          this.totalMovimientos.set(p.total);
          this.cargandoMovimientos.set(false);
        },
        error: (err: unknown) => {
          this.cargandoMovimientos.set(false);
          this.errorMovimientos.set(mensajeDeError(err, 'No se pudieron cargar las comisiones.'));
        },
      });
  }

  protected cargarReglas(): void {
    this.cargandoReglas.set(true);
    this.errorReglas.set(null);
    this.http
      .get<unknown>('/api/comisiones/reglas', {
        context: SILENCIO(),
        params: parametros({ empleadoId: this.filtroEmpleadoId(), servicioId: this.filtroServicioId(), pagina: this.paginaReglas(), tamanoPagina: 20 }),
      })
      .subscribe({
        next: (r) => {
          const p: Pagina<ReglaComision> = normalizarPagina<ReglaComision>(r);
          this.reglas.set(p.elementos);
          this.totalReglas.set(p.total);
          this.cargandoReglas.set(false);
        },
        error: (err: unknown) => {
          this.cargandoReglas.set(false);
          this.errorReglas.set(mensajeDeError(err, 'No se pudieron cargar las reglas.'));
        },
      });
  }

  protected cargarLiquidaciones(): void {
    this.cargandoLiquidaciones.set(true);
    this.errorLiquidaciones.set(null);
    this.http
      .get<unknown>('/api/comisiones/liquidaciones', {
        context: SILENCIO(),
        params: parametros({
          empleadoId: this.filtroEmpleadoId(),
          desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
          hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
          pagina: this.paginaLiquidaciones(),
          tamanoPagina: 20,
        }),
      })
      .subscribe({
        next: (r) => {
          const p: Pagina<LiquidacionComision> = normalizarPagina<LiquidacionComision>(r);
          this.liquidaciones.set(p.elementos);
          this.totalLiquidaciones.set(p.total);
          this.cargandoLiquidaciones.set(false);
        },
        error: (err: unknown) => {
          this.cargandoLiquidaciones.set(false);
          this.errorLiquidaciones.set(mensajeDeError(err, 'No se pudieron cargar las liquidaciones.'));
        },
      });
  }

  protected cambiarFiltro(campo: 'empleado' | 'servicio' | 'estado' | 'tipo' | 'desde' | 'hasta', valor: string): void {
    if (campo === 'empleado') this.filtroEmpleadoId.set(valor);
    if (campo === 'servicio') this.filtroServicioId.set(valor);
    if (campo === 'estado') this.estado.set(valor);
    if (campo === 'tipo') this.tipoMovimiento.set(valor);
    if (campo === 'desde') this.desde.set(valor);
    if (campo === 'hasta') this.hasta.set(valor);
    this.paginaMovimientos.set(1);
    this.paginaReglas.set(1);
    this.paginaLiquidaciones.set(1);
    this.cargarTodo();
  }

  protected irA(tabla: Pestana, pagina: number): void {
    if (tabla === 'movimientos') {
      this.paginaMovimientos.set(pagina);
      this.cargarMovimientos();
    } else if (tabla === 'reglas') {
      this.paginaReglas.set(pagina);
      this.cargarReglas();
    } else {
      this.paginaLiquidaciones.set(pagina);
      this.cargarLiquidaciones();
    }
  }

  protected abrirRegla(regla: ReglaComision | null): void {
    this.errorEnvio.set(null);
    this.panel.set({ tipo: 'regla', regla });
  }

  protected abrirLiquidacion(): void {
    this.errorEnvio.set(null);
    this.panel.set({ tipo: 'liquidacion' });
  }

  protected cerrarPanel(): void {
    if (this.enviando()) return;
    this.panel.set(null);
  }

  protected guardarPanel(valor: Record<string, unknown>): void {
    const p = this.panel();
    if (!p || this.enviando()) return;
    this.enviando.set(true);
    this.errorEnvio.set(null);

    const peticion =
      p.tipo === 'liquidacion'
        ? this.http.post('/api/comisiones/liquidaciones', { comisionIds: [...this.seleccionados()], metodoPagoId: valor['metodoPagoId'], referencia: valor['referencia'] ?? null }, { context: SILENCIO() })
        : p.regla
          ? this.http.put(`/api/comisiones/reglas/${p.regla.id}`, { tipo: valor['tipo'], valor: valor['valor'] }, { context: SILENCIO() })
          : this.http.post('/api/comisiones/reglas', valor, { context: SILENCIO() });

    peticion.subscribe({
      next: () => {
        this.enviando.set(false);
        this.panel.set(null);
        if (p.tipo === 'liquidacion') this.seleccionados.set(new Set());
        this.notificaciones.exito(p.tipo === 'liquidacion' ? 'Liquidación creada correctamente.' : 'Regla guardada correctamente.');
        this.cargarTodo();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.errorEnvio.set(mensajeDeError(err, 'No se pudo guardar.'));
      },
    });
  }

  protected async cambiarEstadoRegla(regla: ReglaComision): Promise<void> {
    const activar = !regla.activa;
    const aceptado = await this.confirmacion.confirmar({
      titulo: activar ? '¿Activar regla?' : '¿Desactivar regla?',
      mensaje: `${this.nombreEmpleado(regla.empleadoId)} · ${this.nombreServicio(regla.servicioId)}`,
      textoAceptar: activar ? 'Activar' : 'Desactivar',
      peligro: !activar,
    });
    if (!aceptado) return;
    this.http.patch(`/api/comisiones/reglas/${regla.id}/estado`, { activa: activar }, { context: SILENCIO() }).subscribe({
      next: () => {
        this.notificaciones.exito(activar ? 'Regla activada.' : 'Regla desactivada.');
        this.cargarReglas();
      },
      error: (err: unknown) => this.notificaciones.error(mensajeDeError(err, 'No se pudo cambiar el estado.')),
    });
  }

  protected seleccionable(c: Comision): boolean {
    return c.estado === 'Pendiente' && c.tipoMovimiento === 'DevengoServicio';
  }

  protected estaSeleccionada(id: string): boolean {
    return this.seleccionados().has(id);
  }

  protected alternarSeleccion(c: Comision): void {
    if (!this.seleccionable(c)) return;
    this.seleccionados.update((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(c.id)) siguiente.delete(c.id);
      else siguiente.add(c.id);
      return siguiente;
    });
  }

  protected limpiarSeleccion(): void {
    this.seleccionados.set(new Set());
  }

  protected nombreEmpleado(id: string): string {
    return this.empleados().find((e) => e.id === id)?.nombre ?? 'Empleado';
  }

  protected nombreServicio(id: string): string {
    return this.servicios().find((s) => s.id === id)?.nombre ?? 'Servicio';
  }

  protected tonoEstado(estado: string): TonoInsignia {
    if (estado === 'Pendiente') return 'aviso';
    if (estado === 'Pagada') return 'exito';
    if (estado === 'Revertida') return 'gris';
    return 'azul';
  }

  protected readonly formatearMoneda = formatearMoneda;
}
