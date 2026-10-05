import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { SesionService } from '../../core/auth/sesion.service';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla, TonoInsignia } from '../../shared/componentes/tabla';
import { CampoForm, OpcionCampo } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';

type Vista = 'pos' | 'historial';
type TipoLinea = 'Producto' | 'Servicio';

interface Cliente {
  id: string;
  nombre: string;
  documento?: string | null;
}

interface ServicioVenta {
  id: string;
  nombre: string;
  categoria?: string | null;
  precio: number | string;
  codigoMoneda: string;
  duracionMinutos: number | string;
}

interface ProductoVenta {
  id: string;
  codigo?: string | null;
  nombre: string;
  categoria?: string | null;
  unidadBase: string;
  manejaFraccion: boolean;
  precioVenta?: number | string | null;
  codigoMoneda: string;
}

interface Empleado {
  id: string;
  nombre: string;
}

interface Impuesto {
  id: string;
  nombre: string;
  porcentaje: number | string;
}

interface MetodoPago {
  id: string;
  nombre: string;
  requiereReferencia: boolean;
  esEfectivo: boolean;
  activo: boolean;
}

interface ConfiguracionNegocio {
  permitirSaldosPendientes: boolean;
  facturacionHabilitada: boolean;
  exigirEmpleadoVentaServicio: boolean;
}

interface CajaActual {
  id: string;
  estado: string;
}

interface CatalogoItem {
  tipo: TipoLinea;
  id: string;
  nombre: string;
  secundario: string;
  precio: number;
  codigoMoneda: string;
  unidad: string;
  manejaFraccion: boolean;
}

interface LineaCarrito {
  uid: number;
  tipo: TipoLinea;
  itemId: string;
  nombre: string;
  precioUnitario: number;
  codigoMoneda: string;
  unidad: string;
  manejaFraccion: boolean;
  cantidad: number;
  tipoDescuento: '' | 'Porcentaje' | 'ImporteFijo';
  valorDescuento: number | null;
  impuestoId: string;
  empleadoId: string;
}

interface PagoEditable {
  uid: number;
  metodoPagoId: string;
  importe: number | null;
  referencia: string;
}

interface LineaVentaDto {
  id: string;
  tipo: string;
  nombre: string;
  unidad: string;
  cantidad: number | string;
  precioUnitario: number | string;
  totalImporte: number | string;
}

interface DocumentoVentaDto {
  tipoDocumento: string;
  numero: string;
}

interface PagoVentaDto {
  id: string;
  metodoPagoNombre: string;
  importe: number | string;
  referencia?: string | null;
  fechaUtc: string;
}

interface Venta {
  id: string;
  clienteId?: string | null;
  clienteNombre?: string | null;
  clienteDocumento?: string | null;
  fechaVentaUtc: string;
  codigoMoneda: string;
  estado: string;
  subtotal: number | string;
  impuestos: number | string;
  total: number | string;
  totalPagado: number | string;
  totalPendiente: number | string;
  totalReintegrado: number | string;
  motivoAnulacion?: string | null;
  lineas: LineaVentaDto[];
  pagos: PagoVentaDto[];
  documentos: DocumentoVentaDto[];
}

type Panel =
  | { tipo: 'detalle'; venta: Venta }
  | { tipo: 'pago'; venta: Venta }
  | { tipo: 'devolucion'; venta: Venta }
  | { tipo: 'anular'; venta: Venta }
  | null;

const SILENCIO = () => new HttpContext().set(SILENCIAR_ERRORES, true);
const ESTADOS_VENTA = ['Finalizada', 'ParcialmenteDevuelta', 'Devuelta', 'Anulada'];

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, Icono, Tabla, Paginador, PanelLateral, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class Ventas implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly sesion = inject(SesionService);

  protected readonly vista = signal<Vista>('pos');
  protected readonly esAdministrador = this.sesion.tieneRol('Administrador');

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly servicios = signal<ServicioVenta[]>([]);
  protected readonly productos = signal<ProductoVenta[]>([]);
  protected readonly empleados = signal<Empleado[]>([]);
  protected readonly impuestos = signal<Impuesto[]>([]);
  protected readonly metodosPago = signal<MetodoPago[]>([]);
  protected readonly configuracion = signal<ConfiguracionNegocio | null>(null);
  protected readonly cajaActual = signal<CajaActual | null>(null);
  protected readonly cargandoCatalogos = signal(true);
  protected readonly errorCatalogos = signal<string | null>(null);

  protected readonly busquedaCatalogo = signal('');
  protected readonly clienteId = signal('');
  protected readonly solicitarFactura = signal(false);
  protected readonly descuentoGeneralTipo = signal<'' | 'Porcentaje' | 'ImporteFijo'>('');
  protected readonly descuentoGeneralValor = signal<number | null>(null);
  protected readonly carrito = signal<LineaCarrito[]>([]);
  protected readonly pagos = signal<PagoEditable[]>([]);
  protected readonly enviandoVenta = signal(false);
  protected readonly errorVenta = signal<string | null>(null);

  protected readonly ventas = signal<Venta[]>([]);
  protected readonly totalVentas = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargandoVentas = signal(true);
  protected readonly errorVentas = signal<string | null>(null);
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly filtroClienteId = signal('');
  protected readonly estado = signal('');

  protected readonly panel = signal<Panel>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly enviandoAccion = signal(false);
  protected readonly errorAccion = signal<string | null>(null);

  private siguienteUid = 1;

  protected readonly columnas: Columna<Venta>[] = [
    { titulo: 'Fecha', valor: (v) => formatearFechaHora(v.fechaVentaUtc) },
    { titulo: 'Cliente', valor: (v) => v.clienteNombre ?? 'Consumidor final', secundario: (v) => v.clienteDocumento },
    {
      titulo: 'Estado',
      valor: (v) => v.estado,
      insignia: (v) => ({ texto: v.estado, tono: this.tonoEstado(v.estado) }),
    },
    { titulo: 'Total', valor: (v) => formatearMoneda(v.total, v.codigoMoneda), alinear: 'derecha' },
    { titulo: 'Pendiente', valor: (v) => formatearMoneda(v.totalPendiente, v.codigoMoneda), alinear: 'derecha', ocultarEnMovil: true },
  ];

  protected readonly catalogo = computed<CatalogoItem[]>(() => [
    ...this.servicios().map((s) => ({
      tipo: 'Servicio' as const,
      id: s.id,
      nombre: s.nombre,
      secundario: [s.categoria, `${s.duracionMinutos} min`].filter(Boolean).join(' · '),
      precio: numero(s.precio),
      codigoMoneda: s.codigoMoneda,
      unidad: 'servicio',
      manejaFraccion: false,
    })),
    ...this.productos().map((p) => ({
      tipo: 'Producto' as const,
      id: p.id,
      nombre: p.nombre,
      secundario: [p.codigo, p.categoria, p.unidadBase].filter(Boolean).join(' · '),
      precio: numero(p.precioVenta),
      codigoMoneda: p.codigoMoneda,
      unidad: p.unidadBase,
      manejaFraccion: p.manejaFraccion,
    })),
  ]);

  protected readonly catalogoFiltrado = computed(() => {
    const texto = this.busquedaCatalogo().trim().toLowerCase();
    const items = this.catalogo();
    if (!texto) return items.slice(0, 18);
    return items.filter((i) => `${i.nombre} ${i.secundario}`.toLowerCase().includes(texto)).slice(0, 18);
  });

  protected readonly subtotal = computed(() => this.carrito().reduce((suma, l) => suma + l.precioUnitario * numero(l.cantidad), 0));
  protected readonly descuentoLineas = computed(() => this.carrito().reduce((suma, l) => suma + this.descuentoLinea(l), 0));
  protected readonly baseDespuesDescuento = computed(() => Math.max(0, this.subtotal() - this.descuentoLineas() - this.descuentoGeneral()));
  protected readonly impuestosCalculados = computed(() =>
    this.carrito().reduce((suma, l) => {
      const impuesto = this.impuestos().find((i) => i.id === l.impuestoId);
      const base = Math.max(0, l.precioUnitario * numero(l.cantidad) - this.descuentoLinea(l));
      return suma + (base * numero(impuesto?.porcentaje)) / 100;
    }, 0),
  );
  protected readonly totalPreview = computed(() => Math.max(0, this.baseDespuesDescuento() + this.impuestosCalculados()));
  protected readonly totalPagos = computed(() => this.pagos().reduce((suma, p) => suma + numero(p.importe), 0));
  protected readonly moneda = computed(() => this.carrito()[0]?.codigoMoneda ?? 'COP');

  protected readonly problemaVenta = computed(() => {
    if (!this.cajaActual()) return 'Abre una caja antes de finalizar ventas.';
    if (this.carrito().length === 0) return 'Agrega al menos un producto o servicio.';
    if (this.solicitarFactura() && !this.configuracion()?.facturacionHabilitada) return 'La facturación no está habilitada en configuración.';
    for (const [i, l] of this.carrito().entries()) {
      const n = i + 1;
      if (numero(l.cantidad) <= 0) return `Línea ${n}: la cantidad debe ser mayor que cero.`;
      if (l.tipo === 'Servicio' && this.configuracion()?.exigirEmpleadoVentaServicio && !l.empleadoId) return `Línea ${n}: selecciona el empleado.`;
    }
    for (const [i, p] of this.pagos().entries()) {
      const n = i + 1;
      const metodo = this.metodosPago().find((m) => m.id === p.metodoPagoId);
      if (!p.metodoPagoId) return `Pago ${n}: selecciona un método de pago.`;
      if (numero(p.importe) <= 0) return `Pago ${n}: el importe debe ser mayor que cero.`;
      if (metodo?.requiereReferencia && !p.referencia.trim()) return `Pago ${n}: la referencia es obligatoria.`;
    }
    if (!this.configuracion()?.permitirSaldosPendientes && Math.round(this.totalPagos() * 100) < Math.round(this.totalPreview() * 100)) {
      return 'La configuración no permite saldos pendientes: registra el pago completo.';
    }
    return null;
  });

  protected readonly opcionesClientes = computed<OpcionCampo[]>(() => this.clientes().map((c) => ({ valor: c.id, etiqueta: c.nombre })));
  protected readonly opcionesMetodos = computed<OpcionCampo[]>(() => this.metodosPago().map((m) => ({ valor: m.id, etiqueta: m.nombre })));
  protected readonly opcionesLineas = computed<OpcionCampo[]>(() => this.ventaPanel()?.lineas.map((l) => ({ valor: l.id, etiqueta: `${l.nombre} · ${formatearCantidad(l.cantidad)}` })) ?? []);

  protected readonly tituloPanel = computed(() => {
    const p = this.panel();
    if (p?.tipo === 'detalle') return 'Detalle de venta';
    if (p?.tipo === 'pago') return 'Agregar pago';
    if (p?.tipo === 'devolucion') return 'Registrar devolución';
    if (p?.tipo === 'anular') return 'Anular venta';
    return '';
  });

  protected readonly ventaPanel = computed(() => this.panel()?.venta ?? null);

  protected readonly camposAccion = computed<CampoForm[]>(() => {
    const p = this.panel();
    if (!p || p.tipo === 'detalle') return [];
    const pago: CampoForm[] = [
      { nombre: 'metodoPagoId', etiqueta: 'Método de pago', tipo: 'seleccion', requerido: true, opciones: this.opcionesMetodos() },
      { nombre: 'importe', etiqueta: p.tipo === 'pago' ? 'Importe abonado' : 'Importe a reintegrar', tipo: 'decimal', requerido: p.tipo === 'pago', min: 0 },
      { nombre: 'referencia', etiqueta: 'Referencia', tipo: 'texto' },
    ];
    if (p.tipo === 'pago') return pago;
    const motivo: CampoForm = { nombre: 'motivo', etiqueta: 'Motivo', tipo: 'area', requerido: true, maximo: 250 };
    if (p.tipo === 'anular') return [motivo, ...pago];
    return [
      motivo,
      { nombre: 'detalleVentaId', etiqueta: 'Línea a devolver', tipo: 'seleccion', requerido: true, opciones: this.opcionesLineas() },
      { nombre: 'cantidad', etiqueta: 'Cantidad', tipo: 'decimal', requerido: true, min: 0 },
      ...pago,
    ];
  });

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarVentas();
  }

  protected cargarCatalogos(): void {
    this.cargandoCatalogos.set(true);
    this.errorCatalogos.set(null);

    forkJoin({
      clientes: this.lista<Cliente>('/api/clientes', { activo: true, tamanoPagina: 100 }),
      servicios: this.lista<ServicioVenta>('/api/servicios', { tamanoPagina: 100 }),
      productos: this.lista<ProductoVenta>('/api/inventario/articulos', { tipo: 'Producto', activo: true, tamanoPagina: 100 }).pipe(catchError(() => of([] as ProductoVenta[]))),
      empleados: this.lista<Empleado>('/api/empleados', { activo: true, tamanoPagina: 100 }).pipe(catchError(() => of([] as Empleado[]))),
      impuestos: this.lista<Impuesto>('/api/configuracion/impuestos', {}).pipe(catchError(() => of([] as Impuesto[]))),
      metodos: this.lista<MetodoPago>('/api/configuracion/metodos-pago', {}).pipe(catchError(() => of([] as MetodoPago[]))),
      configuracion: this.http.get<ConfiguracionNegocio>('/api/configuracion', { context: SILENCIO() }).pipe(catchError(() => of(null))),
      caja: this.http.get<CajaActual | null>('/api/caja/actual', { context: SILENCIO() }).pipe(catchError(() => of(null))),
    }).subscribe({
      next: (r) => {
        this.clientes.set(r.clientes);
        this.servicios.set(r.servicios);
        this.productos.set(r.productos.filter((p) => p.precioVenta !== null && p.precioVenta !== undefined));
        this.empleados.set(r.empleados);
        this.impuestos.set(r.impuestos.filter((i) => true));
        this.metodosPago.set(r.metodos.filter((m) => m.activo !== false));
        this.configuracion.set(r.configuracion);
        this.cajaActual.set(r.caja);
        this.cargandoCatalogos.set(false);
      },
      error: (err: unknown) => {
        this.cargandoCatalogos.set(false);
        this.errorCatalogos.set(mensajeDeError(err, 'No se pudieron cargar los datos para vender.'));
      },
    });
  }

  private lista<T>(url: string, filtros: Record<string, string | number | boolean>) {
    return this.http.get<unknown>(url, { context: SILENCIO(), params: parametros(filtros) }).pipe(map((r) => normalizarPagina<T>(r, 100).elementos));
  }

  protected agregarItem(item: CatalogoItem): void {
    this.carrito.update((lineas) => [
      ...lineas,
      {
        uid: this.siguienteUid++,
        tipo: item.tipo,
        itemId: item.id,
        nombre: item.nombre,
        precioUnitario: item.precio,
        codigoMoneda: item.codigoMoneda,
        unidad: item.unidad,
        manejaFraccion: item.manejaFraccion,
        cantidad: 1,
        tipoDescuento: '',
        valorDescuento: null,
        impuestoId: '',
        empleadoId: '',
      },
    ]);
  }

  protected actualizarLinea(uid: number, cambios: Partial<LineaCarrito>): void {
    this.carrito.update((lineas) => lineas.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));
  }

  protected quitarLinea(uid: number): void {
    this.carrito.update((lineas) => lineas.filter((l) => l.uid !== uid));
  }

  protected agregarPago(): void {
    const restante = Math.max(0, this.totalPreview() - this.totalPagos());
    this.pagos.update((pagos) => [...pagos, { uid: this.siguienteUid++, metodoPagoId: this.metodosPago()[0]?.id ?? '', importe: restante || null, referencia: '' }]);
  }

  protected actualizarPago(uid: number, cambios: Partial<PagoEditable>): void {
    this.pagos.update((pagos) => pagos.map((p) => (p.uid === uid ? { ...p, ...cambios } : p)));
  }

  protected quitarPago(uid: number): void {
    this.pagos.update((pagos) => pagos.filter((p) => p.uid !== uid));
  }

  protected async finalizarVenta(): Promise<void> {
    if (this.problemaVenta() || this.enviandoVenta()) return;
    const aceptado = await this.confirmacion.confirmar({
      titulo: '¿Finalizar venta?',
      mensaje: 'El backend calculará los totales oficiales, descontará inventario cuando corresponda y consumirá la numeración del comprobante.',
      textoAceptar: 'Finalizar venta',
    });
    if (!aceptado) return;

    this.enviandoVenta.set(true);
    this.errorVenta.set(null);
    this.http.post<Venta>('/api/ventas', this.cuerpoVenta(), { context: SILENCIO() }).subscribe({
      next: (venta) => {
        this.enviandoVenta.set(false);
        this.notificaciones.exito('Venta finalizada correctamente.');
        this.carrito.set([]);
        this.pagos.set([]);
        this.clienteId.set('');
        this.solicitarFactura.set(false);
        this.descuentoGeneralTipo.set('');
        this.descuentoGeneralValor.set(null);
        this.cargarCatalogos();
        this.cargarVentas();
        this.panel.set({ tipo: 'detalle', venta });
      },
      error: (err: unknown) => {
        this.enviandoVenta.set(false);
        this.errorVenta.set(mensajeDeError(err, 'No se pudo finalizar la venta.'));
      },
    });
  }

  private cuerpoVenta() {
    return {
      clienteId: this.clienteId() || null,
      solicitarFactura: this.solicitarFactura(),
      descuentoGeneral: this.descuentoGeneralTipo() ? { tipo: this.descuentoGeneralTipo(), valor: numero(this.descuentoGeneralValor()) } : null,
      lineas: this.carrito().map((l) => ({
        tipo: l.tipo,
        articuloInventarioId: l.tipo === 'Producto' ? l.itemId : null,
        servicioId: l.tipo === 'Servicio' ? l.itemId : null,
        empleadoId: l.tipo === 'Servicio' && l.empleadoId ? l.empleadoId : null,
        cantidad: numero(l.cantidad),
        descuento: l.tipoDescuento ? { tipo: l.tipoDescuento, valor: numero(l.valorDescuento) } : null,
        impuestoId: l.impuestoId || null,
      })),
      pagos: this.pagos().length
        ? this.pagos().map((p) => ({ metodoPagoId: p.metodoPagoId, importe: numero(p.importe), referencia: p.referencia.trim() || null }))
        : null,
    };
  }

  protected cargarVentas(): void {
    this.cargandoVentas.set(true);
    this.errorVentas.set(null);
    this.http
      .get<unknown>('/api/ventas', {
        context: SILENCIO(),
        params: parametros({
          desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
          hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
          clienteId: this.filtroClienteId(),
          estado: this.estado(),
          pagina: this.pagina(),
          tamanoPagina: 20,
        }),
      })
      .subscribe({
        next: (r) => {
          const p: Pagina<Venta> = normalizarPagina<Venta>(r);
          this.ventas.set(p.elementos);
          this.totalVentas.set(p.total);
          this.cargandoVentas.set(false);
        },
        error: (err: unknown) => {
          this.cargandoVentas.set(false);
          this.errorVentas.set(mensajeDeError(err, 'No se pudo cargar el historial de ventas.'));
        },
      });
  }

  protected cambiarFiltro(campo: 'desde' | 'hasta' | 'cliente' | 'estado', valor: string): void {
    if (campo === 'desde') this.desde.set(valor);
    if (campo === 'hasta') this.hasta.set(valor);
    if (campo === 'cliente') this.filtroClienteId.set(valor);
    if (campo === 'estado') this.estado.set(valor);
    this.pagina.set(1);
    this.cargarVentas();
  }

  protected irA(pagina: number): void {
    this.pagina.set(pagina);
    this.cargarVentas();
  }

  protected abrirDetalle(venta: Venta): void {
    this.cargandoDetalle.set(true);
    this.errorAccion.set(null);
    this.panel.set({ tipo: 'detalle', venta });
    this.http.get<Venta>(`/api/ventas/${venta.id}`, { context: SILENCIO() }).subscribe({
      next: (v) => {
        this.panel.set({ tipo: 'detalle', venta: v });
        this.cargandoDetalle.set(false);
      },
      error: (err: unknown) => {
        this.cargandoDetalle.set(false);
        this.errorAccion.set(mensajeDeError(err, 'No se pudo cargar el detalle de la venta.'));
      },
    });
  }

  protected abrirAccion(tipo: 'pago' | 'devolucion' | 'anular', venta: Venta): void {
    this.errorAccion.set(null);
    this.panel.set({ tipo, venta });
  }

  protected cerrarPanel(): void {
    if (this.enviandoAccion()) return;
    this.panel.set(null);
  }

  protected guardarAccion(valor: Record<string, unknown>): void {
    const p = this.panel();
    if (!p || p.tipo === 'detalle' || this.enviandoAccion()) return;
    this.enviandoAccion.set(true);
    this.errorAccion.set(null);
    const pago = this.pagoDesdeValor(valor);
    const body =
      p.tipo === 'pago'
        ? { pagos: [pago] }
        : p.tipo === 'anular'
          ? { motivo: valor['motivo'], pagos: pago.importe > 0 ? [pago] : null }
          : {
              motivo: valor['motivo'],
              lineas: [{ detalleVentaId: valor['detalleVentaId'], cantidad: numero(valor['cantidad'] as number | string | null | undefined) }],
              pagos: pago.importe > 0 ? [pago] : null,
            };
    const url =
      p.tipo === 'pago'
        ? `/api/ventas/${p.venta.id}/pagos`
        : p.tipo === 'anular'
          ? `/api/ventas/${p.venta.id}/anular`
          : `/api/ventas/${p.venta.id}/devoluciones`;
    this.http.post<Venta>(url, body, { context: SILENCIO() }).subscribe({
      next: (venta) => {
        this.enviandoAccion.set(false);
        this.notificaciones.exito(p.tipo === 'pago' ? 'Pago registrado.' : p.tipo === 'anular' ? 'Venta anulada.' : 'Devolución registrada.');
        this.panel.set({ tipo: 'detalle', venta });
        this.cargarVentas();
        this.cargarCatalogos();
      },
      error: (err: unknown) => {
        this.enviandoAccion.set(false);
        this.errorAccion.set(mensajeDeError(err, 'No se pudo completar la operación.'));
      },
    });
  }

  private pagoDesdeValor(valor: Record<string, unknown>) {
    return {
      metodoPagoId: String(valor['metodoPagoId'] ?? ''),
      importe: numero(valor['importe'] as number | string | null | undefined),
      referencia: typeof valor['referencia'] === 'string' && valor['referencia'].trim() ? valor['referencia'].trim() : null,
    };
  }

  protected descargarDocumento(venta: Venta, tipo: 'comprobante' | 'factura'): void {
    this.http.get(`/api/ventas/${venta.id}/${tipo}.pdf`, { responseType: 'blob', context: SILENCIO() }).subscribe({
      next: (blob) => this.descargar(blob, `${tipo}-${venta.id}.pdf`),
      error: (err: unknown) => this.notificaciones.error(mensajeDeError(err, `No se pudo descargar el ${tipo}.`)),
    });
  }

  private descargar(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected descuentoLinea(l: LineaCarrito): number {
    const bruto = l.precioUnitario * numero(l.cantidad);
    if (l.tipoDescuento === 'Porcentaje') return Math.min(bruto, (bruto * numero(l.valorDescuento)) / 100);
    if (l.tipoDescuento === 'ImporteFijo') return Math.min(bruto, numero(l.valorDescuento));
    return 0;
  }

  protected descuentoGeneral(): number {
    const base = Math.max(0, this.subtotal() - this.descuentoLineas());
    if (this.descuentoGeneralTipo() === 'Porcentaje') return Math.min(base, (base * numero(this.descuentoGeneralValor())) / 100);
    if (this.descuentoGeneralTipo() === 'ImporteFijo') return Math.min(base, numero(this.descuentoGeneralValor()));
    return 0;
  }

  protected totalLinea(l: LineaCarrito): number {
    return Math.max(0, l.precioUnitario * numero(l.cantidad) - this.descuentoLinea(l));
  }

  protected nombreMetodo(id: string): string {
    return this.metodosPago().find((m) => m.id === id)?.nombre ?? 'Método';
  }

  protected tonoEstado(estado: string): TonoInsignia {
    if (estado === 'Finalizada') return 'exito';
    if (estado === 'Anulada' || estado === 'Devuelta') return 'peligro';
    if (estado === 'ParcialmenteDevuelta') return 'aviso';
    return 'gris';
  }

  protected formatoMoneda(valor: number | string | null | undefined, moneda = this.moneda()): string {
    return formatearMoneda(valor, moneda);
  }

  protected valorNumerico(valor: number | string | null | undefined): number {
    return numero(valor);
  }

  protected readonly formatearFechaHora = formatearFechaHora;
  protected readonly formatearCantidad = formatearCantidad;
  protected readonly estadosVenta = ESTADOS_VENTA;
}
