import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { ArticuloCatalogo, CatalogosService, ConfiguracionVenta, EmpleadoOpcion, ImpuestoOpcion, MetodoPagoOpcion, ServicioCatalogo } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { descargarArchivo } from '../../core/api/descargas';
import { numero } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { Dialogo } from '../../shared/componentes/dialogo';
import { Icono } from '../../shared/componentes/icono';
import { PagoEditable, PagosEditor, pagosParaApi, problemaDePagos } from '../../shared/componentes/pagos-editor';
import { ClienteOpcion, SelectorCliente } from '../../shared/componentes/selector-cliente';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';
import { Caja } from '../caja/modelos';
import { calcularVenta, r2 } from './calculo';
import { Venta, documentoDe } from './modelos';

interface LineaCarrito {
  clave: string;
  tipo: 'Producto' | 'Servicio';
  itemId: string;
  nombre: string;
  detalle: string;
  unidad: string;
  precio: number;
  manejaFraccion: boolean;
  existencia: number | null;
  cantidad: number | null;
  empleadoId: string;
  descuentoTipo: '' | 'Porcentaje' | 'ImporteFijo';
  descuentoValor: number | null;
  impuestoId: string;
  ajustes: boolean;
}

let consecutivo = 0;

@Component({
  selector: 'app-pos',
  imports: [FormsModule, RouterLink, Icono, SelectorCliente, PagosEditor, Dialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pos.html',
  styleUrl: './pos.css',
})
export class Pos implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly catalogos = inject(CatalogosService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  // ----- Contexto de la venta -----
  protected readonly caja = signal<Caja | null | undefined>(undefined);
  protected readonly config = signal<ConfiguracionVenta | null | undefined>(undefined);
  protected readonly metodos = signal<MetodoPagoOpcion[] | null | undefined>(undefined);
  protected readonly impuestos = signal<ImpuestoOpcion[] | null | undefined>(undefined);
  protected readonly empleados = signal<EmpleadoOpcion[] | null | undefined>(undefined);

  // ----- Catálogo -----
  protected readonly pestana = signal<'servicios' | 'productos'>('servicios');
  protected readonly busqueda = signal('');
  protected readonly servicios = signal<ServicioCatalogo[]>([]);
  protected readonly productos = signal<ArticuloCatalogo[] | null | undefined>(undefined);
  protected readonly cargandoCatalogo = signal(true);
  private readonly busquedas$ = new Subject<string>();

  // ----- Carrito -----
  protected readonly lineas = signal<LineaCarrito[]>([]);
  protected readonly cliente = signal<ClienteOpcion | null>(null);
  protected readonly descGeneralTipo = signal<'' | 'Porcentaje' | 'ImporteFijo'>('');
  protected readonly descGeneralValor = signal<number | null>(null);
  protected readonly solicitarFactura = signal(false);
  protected readonly pagos = signal<PagoEditable[]>([{ metodoPagoId: '', importe: null, referencia: '' }]);
  private readonly pagoAutomatico = signal(true);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resultado = signal<Venta | null>(null);
  protected readonly descargando = signal<string | null>(null);

  protected readonly moneda = computed(() => this.config()?.codigoMoneda ?? this.servicios()[0]?.codigoMoneda ?? 'COP');
  protected readonly dinero = (v: number | string | null | undefined) => formatearMoneda(v, this.moneda());
  protected readonly cantidadTexto = formatearCantidad;

  protected readonly permitirSaldos = computed(() => this.config()?.permitirSaldosPendientes === true);
  protected readonly facturacion = computed(() => this.config()?.facturacionHabilitada === true);
  protected readonly exigirEmpleado = computed(() => this.config()?.exigirEmpleadoVentaServicio === true);
  protected readonly sinStockPermitido = computed(() => this.config()?.permitirVentaSinStock === true);

  /** Cálculo estimado (el sistema recalcula el total oficial al registrar la venta). */
  protected readonly calculo = computed(() => {
    const impuestos = this.impuestos() ?? [];
    return calcularVenta(
      this.lineas().map((l) => ({
        precio: l.precio,
        cantidad: numero(l.cantidad),
        descuentoTipo: l.descuentoTipo,
        descuentoValor: numero(l.descuentoValor),
        tasaImpuesto: numero(impuestos.find((x) => x.id === l.impuestoId)?.porcentaje),
      })),
      this.descGeneralTipo(),
      numero(this.descGeneralValor()),
    );
  });

  protected readonly sumaPagos = computed(() => this.pagos().reduce((s, p) => s + numero(p.importe), 0));
  protected readonly saldo = computed(() => r2(this.calculo().total - this.sumaPagos()));

  /** Primer motivo por el que todavía no se puede cobrar, o null. */
  protected readonly problema = computed<string | null>(() => {
    if (!this.caja()) return 'Abre la caja para poder vender.';
    if (this.lineas().length === 0) return 'Agrega al menos un producto o servicio.';
    for (const l of this.lineas()) {
      if (numero(l.cantidad) <= 0) return `«${l.nombre}»: indica una cantidad mayor que cero.`;
      if (!l.manejaFraccion && !Number.isInteger(numero(l.cantidad))) return `«${l.nombre}»: solo admite cantidades enteras.`;
      if (l.tipo === 'Servicio' && this.exigirEmpleado() && !l.empleadoId) return `«${l.nombre}»: elige quién realiza el servicio.`;
      if (l.tipo === 'Producto' && !this.sinStockPermitido() && l.existencia !== null && numero(l.cantidad) > l.existencia) return `«${l.nombre}»: solo hay ${formatearCantidad(l.existencia, l.manejaFraccion)} en existencia.`;
      if (l.descuentoTipo === 'Porcentaje' && numero(l.descuentoValor) > 100) return `«${l.nombre}»: el descuento no puede superar el 100 %.`;
    }
    if (this.descGeneralTipo() === 'Porcentaje' && numero(this.descGeneralValor()) > 100) return 'El descuento general no puede superar el 100 %.';
    const total = this.calculo().total;
    const pagos = this.pagos().filter((p) => p.metodoPagoId || numero(p.importe) > 0 || p.referencia.trim());
    const metodos = this.metodos();
    if (pagos.length > 0) {
      if (!metodos) return 'No se pueden registrar pagos: tu rol no puede consultar los métodos de pago.';
      const e = problemaDePagos(pagos, metodos);
      if (e) return e;
    }
    const suma = pagos.reduce((s, p) => s + numero(p.importe), 0);
    if (suma - total > 0.005) return 'La suma de los pagos supera el total de la venta.';
    if (total - suma > 0.005 && !this.permitirSaldos()) return `Faltan ${this.dinero(total - suma)} por cobrar: esta tienda no permite ventas con saldo pendiente.`;
    return null;
  });

  constructor() {
    this.busquedas$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((texto) => {
          this.cargandoCatalogo.set(true);
          return this.catalogos.servicios(texto, 30).pipe(
            switchMap((servicios) => {
              this.servicios.set(servicios);
              return this.catalogos.productos(texto, 30);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((productos) => {
        this.productos.set(productos);
        this.cargandoCatalogo.set(false);
      });

    // Con un solo pago sin tocar, su importe acompaña al total.
    effect(() => {
      const total = this.calculo().total;
      const auto = this.pagoAutomatico();
      const pagos = untracked(() => this.pagos());
      if (auto && pagos.length === 1) {
        const importe = total > 0 ? total : null;
        if (pagos[0].importe !== importe) untracked(() => this.pagos.set([{ ...pagos[0], importe }]));
      }
    });
  }

  ngOnInit(): void {
    this.http.get<Caja | null>('/api/caja/actual', this.silencio).subscribe({
      next: (c) => this.caja.set(c ?? null),
      error: () => this.caja.set(null),
    });
    this.catalogos.configuracion().subscribe((c) => this.config.set(c));
    this.catalogos.metodosPago().subscribe((m) => {
      this.metodos.set(m);
      const lista = this.pagos();
      if (m && lista.length === 1 && !lista[0].metodoPagoId) this.pagos.set([{ ...lista[0], metodoPagoId: m.find((x) => x.esEfectivo)?.id ?? m[0]?.id ?? '' }]);
    });
    this.catalogos.impuestos().subscribe((i) => this.impuestos.set(i));
    this.catalogos.empleados().subscribe((e) => this.empleados.set(e));
    this.busquedas$.next('');
  }

  // ----- Catálogo -----
  protected buscar(texto: string): void {
    this.busqueda.set(texto);
    this.busquedas$.next(texto);
  }

  protected agregarServicio(s: ServicioCatalogo): void {
    this.agregar({ tipo: 'Servicio', itemId: s.id, nombre: s.nombre, detalle: s.categoria ?? '', unidad: 'servicio', precio: numero(s.precio), manejaFraccion: false, existencia: null });
  }

  protected agregarProducto(a: ArticuloCatalogo): void {
    this.agregar({ tipo: 'Producto', itemId: a.id, nombre: a.nombre, detalle: a.codigo ?? '', unidad: a.unidadBase, precio: numero(a.precioVenta), manejaFraccion: a.manejaFraccion, existencia: numero(a.existenciaActual) });
  }

  private agregar(base: Pick<LineaCarrito, 'tipo' | 'itemId' | 'nombre' | 'detalle' | 'unidad' | 'precio' | 'manejaFraccion' | 'existencia'>): void {
    const existente = this.lineas().find((l) => l.tipo === base.tipo && l.itemId === base.itemId);
    if (existente) {
      this.cambiarCantidad(existente.clave, numero(existente.cantidad) + 1);
      return;
    }
    const impuestoPorDefecto = '';
    this.lineas.update((l) => [
      ...l,
      { ...base, clave: `l${++consecutivo}`, cantidad: 1, empleadoId: '', descuentoTipo: '', descuentoValor: null, impuestoId: impuestoPorDefecto, ajustes: false },
    ]);
  }

  // ----- Carrito -----
  protected cambiarLinea(clave: string, cambios: Partial<LineaCarrito>): void {
    this.lineas.update((l) => l.map((x) => (x.clave === clave ? { ...x, ...cambios } : x)));
  }

  protected cambiarCantidad(clave: string, cantidad: number | null): void {
    this.cambiarLinea(clave, { cantidad });
  }

  protected sumar(l: LineaCarrito, delta: number): void {
    const siguiente = Math.max(0, r2(numero(l.cantidad) + delta));
    if (siguiente === 0) this.quitar(l.clave);
    else this.cambiarCantidad(l.clave, siguiente);
  }

  protected quitar(clave: string): void {
    this.lineas.update((l) => l.filter((x) => x.clave !== clave));
  }

  protected vaciar(): void {
    this.lineas.set([]);
    this.cliente.set(null);
    this.descGeneralTipo.set('');
    this.descGeneralValor.set(null);
    this.solicitarFactura.set(false);
    this.pagoAutomatico.set(true);
    const m = this.metodos();
    this.pagos.set([{ metodoPagoId: m?.find((x) => x.esEfectivo)?.id ?? m?.[0]?.id ?? '', importe: null, referencia: '' }]);
    this.error.set(null);
  }

  protected aplicarImpuestoATodas(id: string): void {
    this.lineas.update((l) => l.map((x) => ({ ...x, impuestoId: id })));
  }

  protected alEditarPagos(p: PagoEditable[]): void {
    this.pagoAutomatico.set(false);
    this.pagos.set(p);
  }

  protected cobrarTodoEnUno(): void {
    this.pagoAutomatico.set(true);
    const m = this.metodos();
    this.pagos.set([{ metodoPagoId: m?.find((x) => x.esEfectivo)?.id ?? m?.[0]?.id ?? '', importe: this.calculo().total || null, referencia: '' }]);
  }

  // ----- Envío -----
  protected cobrar(): void {
    if (this.problema() || this.enviando()) return;
    const impuestos = this.impuestos();
    const cuerpo = {
      clienteId: this.cliente()?.id ?? null,
      solicitarFactura: this.facturacion() && this.solicitarFactura(),
      descuentoGeneral: this.descGeneralTipo() && numero(this.descGeneralValor()) > 0 ? { tipo: this.descGeneralTipo(), valor: numero(this.descGeneralValor()) } : null,
      lineas: this.lineas().map((l) => ({
        tipo: l.tipo,
        articuloInventarioId: l.tipo === 'Producto' ? l.itemId : null,
        servicioId: l.tipo === 'Servicio' ? l.itemId : null,
        empleadoId: l.tipo === 'Servicio' && l.empleadoId ? l.empleadoId : null,
        cantidad: numero(l.cantidad),
        descuento: l.descuentoTipo && numero(l.descuentoValor) > 0 ? { tipo: l.descuentoTipo, valor: numero(l.descuentoValor) } : null,
        impuestoId: impuestos && l.impuestoId ? l.impuestoId : null,
      })),
      pagos: pagosParaApi(this.pagos().filter((p) => numero(p.importe) > 0)),
    };

    this.enviando.set(true);
    this.error.set(null);
    this.http.post<Venta>('/api/ventas', cuerpo, this.silencio).subscribe({
      next: (venta) => {
        this.enviando.set(false);
        this.resultado.set(venta);
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo registrar la venta.'));
      },
    });
  }

  protected nuevaVenta(): void {
    this.resultado.set(null);
    this.vaciar();
    this.busquedas$.next(this.busqueda());
    this.http.get<Caja | null>('/api/caja/actual', this.silencio).subscribe({ next: (c) => this.caja.set(c ?? null) });
  }

  protected descargar(tipo: 'comprobante' | 'factura'): void {
    const v = this.resultado();
    if (!v) return;
    const doc = documentoDe(v, tipo === 'comprobante' ? 'Comprobante' : 'Factura');
    this.descargando.set(tipo);
    descargarArchivo(this.http, `/api/ventas/${v.id}/${tipo}.pdf`, `${doc?.numeroCompleto ?? tipo}.pdf`).subscribe({
      next: () => this.descargando.set(null),
      error: (err: unknown) => {
        this.descargando.set(null);
        this.notificaciones.error(mensajeDeError(err, 'No se pudo descargar el documento.'));
      },
    });
  }

  protected pagoAutoActivo(): boolean {
    return this.pagoAutomatico();
  }

  protected totalLinea(clave: string): number {
    const i = this.lineas().findIndex((l) => l.clave === clave);
    return i >= 0 ? (this.calculo().filas[i]?.total ?? 0) : 0;
  }

  protected comprobante(v: Venta) {
    return documentoDe(v, 'Comprobante');
  }
  protected factura(v: Venta) {
    return documentoDe(v, 'Factura');
  }
  protected num(v: number | string | null | undefined): number {
    return numero(v);
  }
}
