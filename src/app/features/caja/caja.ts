import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { leerProblema, mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFecha, formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Dialogo } from '../../shared/componentes/dialogo';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { CampoForm } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';
import { formatearMoneda } from '../../shared/formato/formato';
import { Caja, CajaDetalle, MovimientoCaja, TIPOS_MOVIMIENTO_CAJA } from './modelos';

type Dialogos = 'abrir' | 'movimiento' | 'cierre' | null;

@Component({
  selector: 'app-caja',
  imports: [FormsModule, Icono, Tabla, Paginador, PanelLateral, Dialogo, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './caja.html',
  styleUrl: './caja.css',
})
export class CajaPagina implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  protected readonly actual = signal<Caja | null>(null);
  protected readonly cargandoActual = signal(true);
  protected readonly errorActual = signal<string | null>(null);
  protected readonly movimientos = signal<MovimientoCaja[]>([]);

  protected readonly historial = signal<Caja[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargandoHistorial = signal(true);
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly dialogo = signal<Dialogos>(null);
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal<string | null>(null);
  protected readonly erroresCampos = signal<Record<string, string[]> | null>(null);

  protected readonly detalle = signal<CajaDetalle | null>(null);
  protected readonly cargandoDetalle = signal(false);

  protected readonly moneda = signal('COP');
  protected readonly dinero = (v: number | string | null | undefined) => formatearMoneda(v, this.moneda());
  protected readonly fechaHora = formatearFechaHora;
  protected readonly tipos = TIPOS_MOVIMIENTO_CAJA;

  /** Efectivo esperado según los movimientos cargados (si la API no lo trae en la caja actual). */
  protected readonly esperadoActual = computed(() => {
    const c = this.actual();
    if (!c) return 0;
    if (c.efectivoEsperado !== null && c.efectivoEsperado !== undefined) return numero(c.efectivoEsperado);
    return numero(c.efectivoApertura) + this.movimientos().reduce((s, m) => s + (TIPOS_MOVIMIENTO_CAJA[m.tipo]?.signo ?? 0) * numero(m.importe), 0);
  });

  protected readonly camposApertura: CampoForm[] = [
    { nombre: 'efectivoInicial', etiqueta: 'Efectivo inicial en caja', tipo: 'decimal', requerido: true, min: 0, valorPorDefecto: 0, ayuda: 'El dinero con el que empiezas el turno (el «fondo» de la caja).' },
  ];
  protected readonly camposMovimiento: CampoForm[] = [
    { nombre: 'tipo', etiqueta: 'Tipo de movimiento', tipo: 'seleccion', requerido: true, valorPorDefecto: 'IngresoManual', opciones: [{ valor: 'IngresoManual', etiqueta: 'Ingreso de efectivo' }, { valor: 'EgresoManual', etiqueta: 'Egreso o retiro de efectivo' }] },
    { nombre: 'importe', etiqueta: 'Importe', tipo: 'decimal', requerido: true, min: 0.01 },
    { nombre: 'concepto', etiqueta: 'Concepto', tipo: 'texto', requerido: true, marcador: 'Ej.: Compra de insumos, retiro del dueño' },
  ];
  protected readonly camposCierre: CampoForm[] = [
    { nombre: 'efectivoContado', etiqueta: 'Efectivo contado en caja', tipo: 'decimal', requerido: true, min: 0, ayuda: 'Cuenta el dinero físico. El sistema calculará la diferencia contra lo esperado.' },
  ];

  protected readonly columnasHistorial: Columna<Caja>[] = [
    { titulo: 'Apertura', valor: (c) => formatearFechaHora(c.fechaAperturaUtc) },
    { titulo: 'Cierre', valor: (c) => (c.fechaCierreUtc ? formatearFechaHora(c.fechaCierreUtc) : '—'), ocultarEnMovil: true },
    { titulo: 'Estado', valor: (c) => c.estado, insignia: (c) => ({ texto: c.estado === 'Abierta' ? 'Abierta' : 'Cerrada', tono: c.estado === 'Abierta' ? 'exito' : 'gris' }) },
    { titulo: 'Esperado', valor: (c) => (c.efectivoEsperado === null || c.efectivoEsperado === undefined ? '—' : this.dinero(c.efectivoEsperado)), alinear: 'derecha', ocultarEnMovil: true },
    {
      titulo: 'Diferencia',
      valor: (c) => (c.diferenciaCierre === null || c.diferenciaCierre === undefined ? '—' : this.dinero(c.diferenciaCierre)),
      insignia: (c) => {
        if (c.diferenciaCierre === null || c.diferenciaCierre === undefined) return null;
        const d = numero(c.diferenciaCierre);
        return { texto: d === 0 ? 'Cuadrada' : this.dinero(d), tono: d === 0 ? 'exito' : d > 0 ? 'azul' : 'peligro' };
      },
      alinear: 'derecha',
    },
  ];

  protected readonly columnasMovimientos: Columna<MovimientoCaja>[] = [
    { titulo: 'Hora', valor: (m) => formatearFechaHora(m.fechaUtc) },
    { titulo: 'Movimiento', valor: (m) => this.tipos[m.tipo]?.texto ?? m.tipo, secundario: (m) => m.concepto, insignia: undefined },
    {
      titulo: 'Importe',
      valor: (m) => `${(this.tipos[m.tipo]?.signo ?? 1) < 0 ? '−' : '+'}${this.dinero(m.importe)}`,
      alinear: 'derecha',
    },
  ];

  ngOnInit(): void {
    this.cargarActual();
    this.cargarHistorial();
  }

  protected cargarActual(): void {
    this.cargandoActual.set(true);
    this.errorActual.set(null);
    this.http.get<Caja | null>('/api/caja/actual', this.silencio).subscribe({
      next: (c) => {
        this.actual.set(c ?? null);
        this.cargandoActual.set(false);
        if (c) {
          this.cargarMovimientosActual(c.id);
        } else {
          this.movimientos.set([]);
        }
      },
      error: (err: unknown) => {
        this.cargandoActual.set(false);
        this.errorActual.set(mensajeDeError(err, 'No se pudo consultar la caja.'));
      },
    });
  }

  private cargarMovimientosActual(id: string): void {
    this.http.get<CajaDetalle>(`/api/caja/${id}`, this.silencio).subscribe({
      next: (d) => {
        this.actual.set(d.caja.estado === 'Abierta' ? { ...d.caja, efectivoEsperado: this.actual()?.efectivoEsperado ?? d.caja.efectivoEsperado } : null);
        this.movimientos.set([...d.movimientos].sort((a, b) => b.fechaUtc.localeCompare(a.fechaUtc)));
        if (d.movimientos[0]) this.moneda.set(d.movimientos[0].codigoMoneda);
      },
    });
  }

  protected cargarHistorial(): void {
    this.cargandoHistorial.set(true);
    const params = parametros({
      desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
      hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
      pagina: this.pagina(),
      tamanoPagina: 10,
    });
    this.http.get<unknown>('/api/caja', { ...this.silencio, params }).subscribe({
      next: (r) => {
        const p: Pagina<Caja> = normalizarPagina<Caja>(r, 10);
        this.historial.set(p.elementos);
        this.total.set(p.total);
        this.cargandoHistorial.set(false);
      },
      error: () => this.cargandoHistorial.set(false),
    });
  }

  protected cambiarFecha(campo: 'desde' | 'hasta', valor: string): void {
    if (campo === 'desde') this.desde.set(valor);
    else this.hasta.set(valor);
    this.pagina.set(1);
    this.cargarHistorial();
  }

  protected irA(p: number): void {
    this.pagina.set(p);
    this.cargarHistorial();
  }

  // ---------- Diálogos ----------
  protected abrirDialogo(d: Exclude<Dialogos, null>): void {
    this.errorEnvio.set(null);
    this.erroresCampos.set(null);
    this.dialogo.set(d);
  }

  protected cerrarDialogo(): void {
    if (this.enviando()) return;
    this.dialogo.set(null);
  }

  private enviar(peticion: import('rxjs').Observable<unknown>, mensaje: string): void {
    this.enviando.set(true);
    this.errorEnvio.set(null);
    this.erroresCampos.set(null);
    peticion.subscribe({
      next: () => {
        this.enviando.set(false);
        this.dialogo.set(null);
        this.notificaciones.exito(mensaje);
        this.detalle.set(null);
        this.cargarActual();
        this.cargarHistorial();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        const p = leerProblema(err);
        this.erroresCampos.set(p.errores ?? null);
        this.errorEnvio.set(p.errores ? 'Revisa los campos marcados.' : mensajeDeError(err, 'No se pudo completar la operación.'));
      },
    });
  }

  protected abrirCaja(v: Record<string, unknown>): void {
    this.enviar(this.http.post('/api/caja/aperturas', { efectivoInicial: v['efectivoInicial'] }, this.silencio), 'La caja se abrió correctamente.');
  }

  protected registrarMovimiento(v: Record<string, unknown>): void {
    const c = this.actual();
    if (!c) return;
    this.enviar(this.http.post(`/api/caja/${c.id}/movimientos`, v, this.silencio), 'El movimiento se registró.');
  }

  protected async cerrarCaja(v: Record<string, unknown>): Promise<void> {
    const c = this.actual();
    if (!c) return;
    const contado = numero(v['efectivoContado'] as number);
    const diferencia = contado - this.esperadoActual();
    const aceptado = await this.confirmacion.confirmar({
      titulo: '¿Cerrar la caja?',
      mensaje:
        diferencia === 0
          ? `El efectivo contado (${this.dinero(contado)}) coincide con lo esperado. Después de cerrar no se podrán registrar ventas ni movimientos en esta caja.`
          : `Hay una diferencia de ${this.dinero(diferencia)} (${diferencia > 0 ? 'sobra' : 'falta'} efectivo). El cierre queda registrado así y no se podrá modificar.`,
      textoAceptar: 'Cerrar caja',
      peligro: diferencia !== 0,
    });
    if (!aceptado) return;
    this.enviar(this.http.post(`/api/caja/${c.id}/cierre`, { efectivoContado: contado }, this.silencio), 'La caja se cerró correctamente.');
  }

  // ---------- Detalle de una caja del historial ----------
  protected verDetalle(caja: Caja): void {
    this.detalle.set({ caja, movimientos: [] });
    this.cargandoDetalle.set(true);
    this.http.get<CajaDetalle>(`/api/caja/${caja.id}`, this.silencio).subscribe({
      next: (d) => {
        this.detalle.set({ caja: d.caja, movimientos: [...d.movimientos].sort((a, b) => a.fechaUtc.localeCompare(b.fechaUtc)) });
        this.cargandoDetalle.set(false);
      },
      error: (err: unknown) => {
        this.cargandoDetalle.set(false);
        this.notificaciones.error(mensajeDeError(err, 'No se pudo cargar el detalle.'));
        this.detalle.set(null);
      },
    });
  }

  protected tituloDetalle = computed(() => {
    const d = this.detalle();
    return d ? `Caja del ${formatearFecha(d.caja.fechaAperturaUtc)}` : '';
  });

  protected diferenciaDe(c: Caja): number | null {
    return c.diferenciaCierre === null || c.diferenciaCierre === undefined ? null : numero(c.diferenciaCierre);
  }

  protected num(v: number | string | null | undefined): number {
    return numero(v);
  }
}
