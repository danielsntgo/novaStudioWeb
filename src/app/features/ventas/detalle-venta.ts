import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogosService, MetodoPagoOpcion } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { descargarArchivo } from '../../core/api/descargas';
import { numero } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { SesionService } from '../../core/auth/sesion.service';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PagoEditable, PagosEditor, pagosParaApi, problemaDePagos } from '../../shared/componentes/pagos-editor';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';
import { r2 } from './calculo';
import { ESTADOS_VENTA, Venta, admiteDevolucion, documentoDe } from './modelos';

type Modo = 'ver' | 'abonar' | 'devolver' | 'anular';


@Component({
  selector: 'app-detalle-venta',
  imports: [FormsModule, Icono, PagosEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detalle-venta.html',
  styleUrl: './detalle-venta.css',
})
export class DetalleVenta implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly catalogos = inject(CatalogosService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  readonly venta = input.required<Venta>();
  readonly cambio = output<void>();

  protected readonly esAdministrador = inject(SesionService).tieneRol('Administrador');
  protected readonly modo = signal<Modo>('ver');
  protected readonly actual = signal<Venta | null>(null);
  protected readonly metodos = signal<MetodoPagoOpcion[] | null | undefined>(undefined);
  protected readonly enviando = signal(false);
  protected readonly descargando = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  // Formularios de acciones
  protected readonly pagos = signal<PagoEditable[]>([]);
  protected readonly motivo = signal('');
  protected readonly cantidades = signal<Record<string, number | null>>({});

  protected readonly v = computed(() => this.actual() ?? this.venta());
  protected readonly estado = computed(() => ESTADOS_VENTA[this.v().estado] ?? { texto: this.v().estado, tono: 'gris' as const });
  protected readonly pendiente = computed(() => numero(this.v().totalPendiente));
  protected readonly puedeAbonar = computed(() => this.pendiente() > 0 && this.v().estado !== 'Anulada' && this.v().estado !== 'Devuelta');
  protected readonly puedeDevolver = computed(() => this.esAdministrador && admiteDevolucion(this.v().estado));
  protected readonly comprobante = computed(() => documentoDe(this.v(), 'Comprobante'));
  protected readonly factura = computed(() => documentoDe(this.v(), 'Factura'));

  /** Unidades ya devueltas por línea (suma de devoluciones previas). */
  private readonly devueltas = computed(() => {
    const mapa: Record<string, number> = {};
    for (const d of this.v().devoluciones)
      for (const l of d.lineas) mapa[l.detalleVentaId] = (mapa[l.detalleVentaId] ?? 0) + numero(l.cantidad);
    return mapa;
  });

  /** Importe ya reconocido por línea, para que las devoluciones parciales sumen al total original. */
  private readonly importesDevueltos = computed(() => {
    const mapa: Record<string, number> = {};
    for (const d of this.v().devoluciones)
      for (const l of d.lineas) mapa[l.detalleVentaId] = r2((mapa[l.detalleVentaId] ?? 0) + numero(l.importe));
    return mapa;
  });

  protected readonly lineasDevolubles = computed(() =>
    this.v().lineas.map((l) => ({ linea: l, disponible: r2(numero(l.cantidad) - (this.devueltas()[l.id] ?? 0)) })).filter((x) => x.disponible > 0),
  );

  /** Importe de las líneas que se van a devolver (con impuestos), proporcional a las unidades. */
  protected readonly importeADevolver = computed(() => {
    let total = 0;
    for (const { linea, disponible } of this.lineasDevolubles()) {
      const c = Math.min(numero(this.cantidades()[linea.id]), disponible);
      if (c > 0) {
        const importeRestante = Math.max(0, numero(linea.totalImporte) - (this.importesDevueltos()[linea.id] ?? 0));
        const importeLinea = c === disponible
          ? importeRestante
          : Math.min(importeRestante, r2(numero(linea.totalImporte) * c / numero(linea.cantidad)));
        total += importeLinea;
      }
    }
    return r2(total);
  });

  /** Estimación del reintegro: lo cobrado que excede el valor de lo que se queda el cliente. */
  protected readonly reintegroEstimado = computed(() => {
    const v = this.v();
    const modo = this.modo();
    const devueltoDespues = modo === 'anular' ? numero(v.total) : numero(v.totalDevuelto) + this.importeADevolver();
    const quedaDeValor = Math.max(0, numero(v.total) - devueltoDespues);
    const correspondeTotal = Math.max(0, numero(v.totalPagado) - quedaDeValor);
    return r2(Math.max(0, correspondeTotal - numero(v.totalReintegrado)));
  });

  ngOnInit(): void {
    this.cargarMetodos();
  }

  private cargarMetodos(): void {
    if (this.metodos() !== undefined) return;
    this.catalogos.metodosPago().subscribe((m) => {
      this.metodos.set(m);
      this.alCargarMetodos();
    });
  }

  protected dinero(valor: number | string | null | undefined): string {
    return formatearMoneda(valor, this.v().codigoMoneda);
  }
  protected cantidad(valor: number | string): string {
    return formatearCantidad(valor);
  }
  protected fechaHora(valor: string): string {
    return formatearFechaHora(valor);
  }
  protected num(valor: number | string | null | undefined): number {
    return numero(valor);
  }

  // ---------- Cambio de modo ----------
  protected iniciar(modo: Exclude<Modo, 'ver'>): void {
    this.error.set(null);
    this.motivo.set('');
    this.cantidades.set({});
    this.modo.set(modo);
    this.cargarMetodos();
    this.prepararPagos();
  }

  protected volver(): void {
    this.modo.set('ver');
    this.error.set(null);
  }

  private metodoEfectivo(): string {
    return this.metodos()?.find((m) => m.esEfectivo)?.id ?? this.metodos()?.[0]?.id ?? '';
  }

  private prepararPagos(): void {
    const modo = this.modo();
    if (modo === 'abonar') this.pagos.set([{ metodoPagoId: this.metodoEfectivo(), importe: this.pendiente(), referencia: '' }]);
    else this.pagos.set([{ metodoPagoId: this.metodoEfectivo(), importe: null, referencia: '' }]);
  }

  protected alCargarMetodos(): void {
    // Cuando llegan los métodos de pago, se rellena el primero si aún está vacío.
    const lista = this.pagos();
    if (lista.length === 1 && !lista[0].metodoPagoId) this.pagos.set([{ ...lista[0], metodoPagoId: this.metodoEfectivo() }]);
  }

  protected cambiarCantidad(id: string, valor: number | null, maximo: number): void {
    const linea = this.v().lineas.find((item) => item.id === id);
    const admiteFraccion = linea?.tipo === 'Producto' && linea.manejaFraccion;
    const cantidad = valor === null ? null : Math.min(Math.max(admiteFraccion ? Math.round(valor * 1000) / 1000 : Math.trunc(valor), 0), maximo);
    this.cantidades.update((c) => ({ ...c, [id]: cantidad }));
    this.autoReintegro();
  }

  protected devolverTodo(): void {
    const c: Record<string, number | null> = {};
    for (const { linea, disponible } of this.lineasDevolubles()) c[linea.id] = disponible;
    this.cantidades.set(c);
    this.autoReintegro();
  }

  /** Mientras el usuario no edite los pagos, el importe sigue a la estimación del reintegro. */
  private autoReintegro(): void {
    const lista = this.pagos();
    if (lista.length === 1) {
      const e = this.reintegroEstimado();
      this.pagos.set([{ ...lista[0], importe: e > 0 ? e : null }]);
    }
  }

  protected usarReintegroEstimado(): void {
    this.prepararPagos();
    this.autoReintegro();
  }

  // ---------- Validación ----------
  protected readonly problema = computed<string | null>(() => {
    const modo = this.modo();
    if (modo === 'ver') return null;
    const metodos = this.metodos();
    if (!metodos) return null;
    const pagosFormulario = this.pagos().filter((p) => p.metodoPagoId || numero(p.importe) > 0 || p.referencia);
    if (modo === 'abonar') {
      if (pagosFormulario.length === 0) return 'Agrega al menos un pago.';
      const e = problemaDePagos(pagosFormulario, metodos);
      if (e) return e;
      const suma = pagosFormulario.reduce((s, p) => s + numero(p.importe), 0);
      if (suma - this.pendiente() > 0.005) return `La suma de los pagos no puede superar el saldo pendiente (${this.dinero(this.pendiente())}).`;
      return null;
    }
    if (!this.motivo().trim()) return 'Escribe el motivo.';
    if (this.motivo().length > 250) return 'El motivo admite hasta 250 caracteres.';
    if (modo === 'devolver' && this.importeADevolver() <= 0) return 'Indica la cantidad de al menos una línea a devolver.';
    const pagosReintegro = this.pagos().filter((p) => numero(p.importe) > 0 || !!p.referencia.trim() || (this.reintegroEstimado() > 0 && !!p.metodoPagoId));
    if (pagosReintegro.length > 0) {
      const e = problemaDePagos(pagosReintegro, metodos);
      if (e) return e;
    }
    const sumaReintegro = r2(pagosReintegro.reduce((s, p) => s + numero(p.importe), 0));
    if (Math.abs(sumaReintegro - this.reintegroEstimado()) > 0.005) {
      return `El reintegro debe ser exactamente ${this.dinero(this.reintegroEstimado())}.`;
    }
    return null;
  });

  // ---------- Acciones ----------
  protected abonar(): void {
    if (this.problema() || this.enviando()) return;
    const pagos = pagosParaApi(this.pagos());
    this.ejecutar(this.http.post<Venta>(`/api/ventas/${this.v().id}/pagos`, { pagos }, this.silencio), 'El abono se registró correctamente.');
  }

  protected async devolver(): Promise<void> {
    if (this.problema() || this.enviando()) return;
    const lineas = this.lineasDevolubles()
      .map(({ linea, disponible }) => ({ detalleVentaId: linea.id, cantidad: Math.min(numero(this.cantidades()[linea.id]), disponible) }))
      .filter((l) => l.cantidad > 0);
    const aceptado = await this.confirmacion.confirmar({
      titulo: '¿Registrar la devolución?',
      mensaje: `Se devolverán ${this.dinero(this.importeADevolver())} en mercancía o servicios. Los productos vuelven al inventario y las comisiones se ajustan. No se puede deshacer.`,
      textoAceptar: 'Registrar devolución',
      peligro: true,
    });
    if (!aceptado) return;
    const pagos = pagosParaApi(this.pagos().filter((p) => numero(p.importe) > 0));
    this.ejecutar(
      this.http.post<Venta>(`/api/ventas/${this.v().id}/devoluciones`, { motivo: this.motivo().trim(), lineas, pagos }, this.silencio),
      'La devolución se registró correctamente.',
    );
  }

  protected async anular(): Promise<void> {
    if (this.problema() || this.enviando()) return;
    const aceptado = await this.confirmacion.confirmar({
      titulo: '¿Anular la venta?',
      mensaje: 'Se anulan todas las unidades que no se hayan devuelto: el inventario se repone, la caja registra el reembolso y las comisiones se revierten. La venta no se borra y esta acción no se puede deshacer.',
      textoAceptar: 'Anular venta',
      peligro: true,
    });
    if (!aceptado) return;
    const pagos = pagosParaApi(this.pagos().filter((p) => numero(p.importe) > 0));
    this.ejecutar(this.http.post<Venta>(`/api/ventas/${this.v().id}/anular`, { motivo: this.motivo().trim(), pagos }, this.silencio), 'La venta se anuló correctamente.');
  }

  private ejecutar(peticion: import('rxjs').Observable<Venta>, mensaje: string): void {
    this.enviando.set(true);
    this.error.set(null);
    peticion.subscribe({
      next: (venta) => {
        this.enviando.set(false);
        this.actual.set(venta);
        this.modo.set('ver');
        this.notificaciones.exito(mensaje);
        this.cambio.emit();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo completar la operación.'));
      },
    });
  }

  protected descargar(tipo: 'comprobante' | 'factura'): void {
    const doc = tipo === 'comprobante' ? this.comprobante() : this.factura();
    this.descargando.set(tipo);
    descargarArchivo(this.http, `/api/ventas/${this.v().id}/${tipo}.pdf`, `${doc?.numeroCompleto ?? tipo}.pdf`).subscribe({
      next: () => this.descargando.set(null),
      error: (err: unknown) => {
        this.descargando.set(null);
        this.notificaciones.error(mensajeDeError(err, 'No se pudo descargar el documento.'));
      },
    });
  }
}
