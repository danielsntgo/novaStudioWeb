import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, map, of } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { leerProblema, mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { SesionService } from '../../core/auth/sesion.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { columnaEstado } from '../../shared/componentes/tabla';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';
import { CampoForm, OpcionCampo } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';
import { formatearMoneda } from '../../shared/formato/formato';

type Vista = 'cuentas' | 'movimientos' | 'transferencias' | 'metodos';
type TipoCuenta = 'Efectivo' | 'Banco' | 'TarjetaCredito' | 'Billetera' | 'Otro';
type Panel = { tipo: 'cuenta'; cuenta: CuentaFinanciera | null } | { tipo: 'transferencia' } | { tipo: 'movimiento' } | null;

interface CuentaFinanciera {
  id: string;
  nombre: string;
  tipo: TipoCuenta | string;
  codigoMoneda: string;
  entidad: string | null;
  ultimosDigitos: string | null;
  cupoCredito: number | string | null;
  saldo: number | string;
  activa: boolean;
  fechaCreacionUtc: string;
  fechaModificacionUtc: string | null;
}

interface MetodoPago {
  id: string;
  nombre: string;
  requiereReferencia: boolean;
  esEfectivo: boolean;
  cuentaFinancieraId: string;
  cuentaFinancieraNombre: string;
  activo: boolean;
}

interface MovimientoFinanciero {
  id: string;
  tipo: string;
  sentido: 'Entrada' | 'Salida' | string;
  importe: number | string;
  codigoMoneda: string;
  concepto: string | null;
  fechaUtc: string;
  cajaId: string | null;
  metodoPagoId: string | null;
  ventaId: string | null;
  devolucionVentaId: string | null;
  liquidacionComisionId: string | null;
  transferenciaFinancieraId: string | null;
  compraId: string | null;
  usuarioId: string | null;
  migrado: boolean;
  saldoPosterior: number | string;
}

interface ResumenFinanciero {
  disponibleTotal: number | string;
  deudaTarjetasTotal: number | string;
  cuentasActivas: number | string;
}

type FilaTransferencia = Record<string, unknown>;

const SILENCIO = () => new HttpContext().set(SILENCIAR_ERRORES, true);
const TIPOS_CUENTA: OpcionCampo[] = [
  { valor: 'Efectivo', etiqueta: 'Efectivo' },
  { valor: 'Banco', etiqueta: 'Banco' },
  { valor: 'Billetera', etiqueta: 'Billetera digital' },
  { valor: 'TarjetaCredito', etiqueta: 'Tarjeta de crédito' },
  { valor: 'Otro', etiqueta: 'Otro' },
];
const TIPOS_MOVIMIENTO = [
  'SaldoInicial',
  'PagoVenta',
  'Reembolso',
  'IngresoManual',
  'EgresoManual',
  'PagoComision',
  'TransferenciaEntrada',
  'TransferenciaSalida',
  'AjusteApertura',
  'AjusteCierre',
  'AjusteMigracion',
  'PagoCompra',
  'ReembolsoCompra',
];

@Component({
  selector: 'app-finanzas',
  imports: [FormsModule, Icono, PanelLateral, Paginador, FormularioDinamico, ListaCrud],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './finanzas.html',
  styleUrl: './finanzas.css',
})
export class Finanzas implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sesion = inject(SesionService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);

  protected readonly vista = signal<Vista>('cuentas');
  protected readonly esAdmin = () => this.sesion.tieneRol('Administrador');
  protected readonly resumen = signal<ResumenFinanciero | null>(null);
  protected readonly cuentas = signal<CuentaFinanciera[]>([]);
  protected readonly cuentasDisponibles = signal<CuentaFinanciera[]>([]);
  protected readonly monedaNegocio = signal('COP');
  protected readonly moneda = computed(() => this.monedaNegocio());
  protected readonly paginaCuentas = signal(1);
  protected readonly totalCuentas = signal(0);
  protected readonly cargandoCuentas = signal(true);
  protected readonly errorCuentas = signal<string | null>(null);
  protected readonly buscarCuenta = signal('');
  protected readonly estadoCuenta = signal<'true' | 'false' | ''>('true');
  protected readonly cuentaLibroId = signal('');
  protected readonly cuentaLibro = computed(() => this.cuentasDisponibles().find((cuenta) => cuenta.id === this.cuentaLibroId()) ?? null);

  protected readonly movimientos = signal<MovimientoFinanciero[]>([]);
  protected readonly totalMovimientos = signal(0);
  protected readonly paginaMovimientos = signal(1);
  protected readonly cargandoMovimientos = signal(false);
  protected readonly errorMovimientos = signal<string | null>(null);
  protected readonly desdeMovimientos = signal('');
  protected readonly hastaMovimientos = signal('');
  protected readonly tipoMovimiento = signal('');

  protected readonly transferencias = signal<FilaTransferencia[]>([]);
  protected readonly totalTransferencias = signal(0);
  protected readonly paginaTransferencias = signal(1);
  protected readonly cargandoTransferencias = signal(false);
  protected readonly errorTransferencias = signal<string | null>(null);
  protected readonly desdeTransferencias = signal('');
  protected readonly hastaTransferencias = signal('');
  protected readonly cuentaTransferencia = signal('');

  protected readonly panel = signal<Panel>(null);
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal<string | null>(null);
  protected readonly erroresCampos = signal<Record<string, string[]> | null>(null);

  protected readonly tiposCuenta = TIPOS_CUENTA;
  protected readonly opcionesTipoCuenta = computed<OpcionCampo[]>(() => this.metodosPagoActivos()
    .filter((metodo) => metodo.activo)
    .map((metodo) => ({ valor: metodo.id, etiqueta: metodo.nombre })));
  protected readonly claseDeCuenta = (tipo: string): string => {
    const etiquetas: Record<string, string> = {
      Efectivo: 'Efectivo', Banco: 'Banco', TarjetaCredito: 'Tarjeta de crédito',
      Billetera: 'Billetera digital', Otro: 'Otra cuenta',
    };
    return etiquetas[tipo] ?? tipo;
  };
  protected readonly opcionesClaseCuenta = (valor: Record<string, unknown>): OpcionCampo[] => {
    const metodo = this.metodosPagoActivos().find((item) => item.id === valor['tipo'] && item.activo);
    if (!metodo) return TIPOS_CUENTA;
    return TIPOS_CUENTA.filter((opcion) => metodo.esEfectivo
      ? opcion.valor === 'Efectivo'
      : ['Banco', 'Billetera', 'Otro'].includes(opcion.valor));
  };
  protected readonly nombreTipoCuenta = (cuenta: CuentaFinanciera): string => {
    const metodos = this.metodosPagoActivos().filter((metodo) => metodo.cuentaFinancieraId === cuenta.id);
    return metodos.length ? metodos.map((metodo) => metodo.nombre).join(' · ') : this.claseDeCuenta(cuenta.tipo);
  };
  protected readonly tiposMovimiento = TIPOS_MOVIMIENTO;
  protected readonly etiquetaMovimiento = (tipo: string): string => {
    const etiquetas: Record<string, string> = {
      SaldoInicial: 'Saldo inicial',
      PagoVenta: 'Pago de venta',
      Reembolso: 'Reembolso',
      IngresoManual: 'Ingreso manual',
      EgresoManual: 'Egreso manual',
      PagoComision: 'Pago de comisión',
      TransferenciaEntrada: 'Transferencia recibida',
      TransferenciaSalida: 'Transferencia enviada',
      AjusteApertura: 'Ajuste de apertura',
      AjusteCierre: 'Ajuste de cierre',
      AjusteMigracion: 'Ajuste de migración',
      PagoCompra: 'Pago de compra',
      ReembolsoCompra: 'Reembolso de compra',
    };
    return etiquetas[tipo] ?? tipo;
  };
  protected readonly cuentasActivas = computed(() => this.cuentasDisponibles().filter((cuenta) => cuenta.activa));
  protected readonly metodosPagoActivos = signal<MetodoPago[]>([]);
  protected readonly cargandoMetodosPago = signal(false);
  protected readonly errorMetodosPago = signal<string | null>(null);
  protected readonly opcionesMetodoPago = computed<OpcionCampo[]>(() => this.metodosPagoActivos()
    .filter((metodo) => metodo.activo)
    .map((metodo) => ({ valor: metodo.id, etiqueta: `${metodo.nombre} → ${metodo.cuentaFinancieraNombre}` })));
  protected readonly camposMovimiento = computed<CampoForm[]>(() => [
    { nombre: 'metodoPagoId', etiqueta: 'Método de pago', tipo: 'seleccion', requerido: true, opciones: this.opcionesMetodoPago() },
    { nombre: 'sentido', etiqueta: 'Movimiento', tipo: 'seleccion', requerido: true, valorPorDefecto: 'Entrada', opciones: [{ valor: 'Entrada', etiqueta: 'Entrada de dinero' }, { valor: 'Salida', etiqueta: 'Salida de dinero' }] },
    { nombre: 'importe', etiqueta: 'Importe', tipo: 'decimal', requerido: true, min: 0.01, paso: 0.01 },
    { nombre: 'concepto', etiqueta: 'Concepto', tipo: 'texto', requerido: true, maximo: 250, marcador: 'Ej.: Recarga o retiro' },
  ]);
  protected readonly opcionesOrigen = computed<OpcionCampo[]>(() => this.cuentasActivas()
    .filter((cuenta) => cuenta.tipo !== 'TarjetaCredito')
    .map((cuenta) => ({ valor: cuenta.id, etiqueta: `${cuenta.nombre} · ${this.nombreTipoCuenta(cuenta)} · ${this.formato(cuenta.saldo, cuenta.codigoMoneda)}` })));
  protected readonly camposCuenta = computed<CampoForm[]>(() => {
    const panel = this.panel();
    const cuentaNueva = panel?.tipo === 'cuenta' && !panel.cuenta;
    return [
    { nombre: 'nombre', etiqueta: 'Nombre de la cuenta', tipo: 'texto', requerido: true },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', requerido: cuentaNueva, opciones: this.opcionesTipoCuenta(), ayuda: 'Solo aparecen métodos de pago activos. Al guardar, el método quedará asociado a esta cuenta.' },
    { nombre: 'naturaleza', etiqueta: 'Clase de cuenta', tipo: 'seleccion', requerido: true, opcionesSegun: (valor) => this.opcionesClaseCuenta(valor), ayuda: 'Define cómo se calcula el saldo y si requiere caja.' },
    { nombre: 'codigoMoneda', etiqueta: 'Moneda', tipo: 'texto', requerido: true, maximo: 3, mayusculas: true, deshabilitado: true, marcador: 'COP', ayuda: 'Moneda configurada para el negocio.' },
    { nombre: 'saldoInicial', etiqueta: 'Saldo inicial / deuda inicial', tipo: 'decimal', min: 0, paso: 0.01, valorPorDefecto: 0, visibleSi: () => { const panel = this.panel(); return panel?.tipo === 'cuenta' && !panel.cuenta; }, ayuda: 'Se registra como saldo de apertura y queda en el historial de la cuenta. En tarjetas de crédito representa la deuda inicial.' },
    { nombre: 'entidad', etiqueta: 'Entidad financiera', tipo: 'texto' },
    { nombre: 'ultimosDigitos', etiqueta: 'Últimos dígitos', tipo: 'texto', maximo: 4, ayuda: 'Opcional; no ingreses el número completo.' },
    { nombre: 'cupoCredito', etiqueta: 'Cupo de crédito', tipo: 'decimal', min: 0, visibleSi: (valor) => valor['naturaleza'] === 'TarjetaCredito', ayuda: 'Opcional. Limita el saldo de deuda permitido.' },
    ];
  });

  protected readonly camposTransferencia = computed<CampoForm[]>(() => [
    { nombre: 'cuentaOrigenId', etiqueta: 'Cuenta de origen', tipo: 'seleccion', requerido: true, opciones: this.opcionesOrigen() },
    {
      nombre: 'cuentaDestinoId',
      etiqueta: 'Cuenta de destino',
      tipo: 'seleccion',
      requerido: true,
      opcionesSegun: (valor: Record<string, unknown>) => this.cuentasActivas()
        .filter((cuenta) => cuenta.id !== valor['cuentaOrigenId'])
        .map((cuenta) => ({ valor: cuenta.id, etiqueta: `${cuenta.nombre} · ${this.nombreTipoCuenta(cuenta)} · ${this.formato(cuenta.saldo, cuenta.codigoMoneda)}` })),
    },
    { nombre: 'importe', etiqueta: 'Importe', tipo: 'decimal', requerido: true, min: 0.01, paso: 0.01 },
    { nombre: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
    { nombre: 'referencia', etiqueta: 'Referencia', tipo: 'texto' },
  ]);

  protected readonly configMetodosPago: ConfigCrud<MetodoPago> = {
    titulo: 'Métodos de pago',
    subtitulo: 'Relaciona cada forma de pago con la cuenta que recibe el dinero.',
    textoNuevo: 'Nuevo método',
    singular: 'método de pago',
    nombre: (metodo) => metodo.nombre,
    urlLista: '/api/configuracion/metodos-pago',
    paginado: false,
    filtroActivo: false,
    incrustado: true,
    columnas: [
      { titulo: 'Método de pago', valor: (metodo) => metodo.nombre },
      {
        titulo: 'Tipo',
        valor: (metodo) => (metodo.esEfectivo ? 'Efectivo' : 'Otro método'),
        insignia: (metodo) => ({ texto: metodo.esEfectivo ? 'Efectivo' : 'No efectivo', tono: metodo.esEfectivo ? 'exito' : 'gris' }),
      },
      { titulo: 'Cuenta que recibe', valor: (metodo) => metodo.cuentaFinancieraNombre },
      {
        titulo: 'Referencia',
        valor: (metodo) => (metodo.requiereReferencia ? 'Obligatoria' : 'No requerida'),
        insignia: (metodo) => ({ texto: metodo.requiereReferencia ? 'Obligatoria' : 'No requerida', tono: metodo.requiereReferencia ? 'azul' : 'gris' }),
        ocultarEnMovil: true,
      },
      columnaEstado<MetodoPago>(),
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Método de pago', tipo: 'texto', requerido: true, marcador: 'Ej.: Efectivo, Transferencia, Nequi' },
      { nombre: 'esEfectivo', etiqueta: 'Es efectivo', tipo: 'casilla', ayuda: 'Solo puede existir un método de efectivo; sus movimientos afectan la caja.' },
      { nombre: 'requiereReferencia', etiqueta: 'Requiere referencia', tipo: 'casilla', ayuda: 'Solicita el número de autorización o comprobante al cobrar.' },
      {
        nombre: 'cuentaFinancieraId',
        etiqueta: 'Cuenta que recibe el dinero',
        tipo: 'seleccion',
        requerido: true,
        opcionesSegun: (valor: Record<string, unknown>) => this.opcionesCuentaPago(valor['esEfectivo'] === true),
        ayuda: 'El efectivo se asigna a una cuenta de efectivo; los demás métodos a una cuenta bancaria, billetera u otra.',
      },
    ],
    aFormulario: (metodo) => ({
      nombre: metodo.nombre,
      esEfectivo: metodo.esEfectivo,
      requiereReferencia: metodo.requiereReferencia,
      cuentaFinancieraId: metodo.cuentaFinancieraId,
    }),
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    mensajeCreado: 'El método de pago se creó correctamente.',
    mensajeActualizado: 'El método de pago se actualizó correctamente.',
    vacio: { titulo: 'Sin métodos de pago', detalle: 'Agrega los medios que aceptas para cobrar.' },
  };

  ngOnInit(): void {
    if (!this.esAdmin()) {
      void this.router.navigateByUrl('/caja');
      return;
    }
    this.cargarResumen();
    this.cargarCuentas();
    this.cargarCuentasDisponibles();
    this.cargarMetodosPago();
    this.http.get<{ codigoMoneda?: string }>('/api/configuracion', { context: SILENCIO() }).pipe(catchError(() => of({} as { codigoMoneda?: string }))).subscribe({
      next: (configuracion) => {
        if (configuracion.codigoMoneda) this.monedaNegocio.set(configuracion.codigoMoneda);
      },
    });
  }

  protected cargarMetodosPago(): void {
    this.cargandoMetodosPago.set(true);
    this.errorMetodosPago.set(null);
    this.http.get<MetodoPago[]>('/api/configuracion/metodos-pago', { context: SILENCIO() }).subscribe({
      next: (metodos) => {
        this.metodosPagoActivos.set(Array.isArray(metodos) ? metodos : []);
        this.cargandoMetodosPago.set(false);
      },
      error: (error: unknown) => {
        this.cargandoMetodosPago.set(false);
        this.errorMetodosPago.set(mensajeDeError(error, 'No se pudieron cargar los métodos de pago.'));
      },
    });
  }

  protected nombreMetodoPago(id: string | null): string {
    return this.metodosPagoActivos().find((metodo) => metodo.id === id)?.nombre ?? '—';
  }

  private cargarCuentasDisponibles(): void {
    this.http.get<unknown>('/api/finanzas/cuentas', {
      context: SILENCIO(),
      params: parametros({ activa: true, pagina: 1, tamanoPagina: 100 }),
    }).pipe(
      map((respuesta) => normalizarPagina<CuentaFinanciera>(respuesta, 100).elementos),
      catchError(() => of([] as CuentaFinanciera[])),
    ).subscribe((cuentas) => {
      this.cuentasDisponibles.set(cuentas);
      if (!this.cuentaLibroId() && cuentas.length > 0) this.cuentaLibroId.set(cuentas[0].id);
      if (this.vista() === 'movimientos') this.cargarMovimientos();
    });
  }

  protected cambiarVista(vista: Vista): void {
    if (!this.esAdmin()) return;
    this.vista.set(vista);
    if (vista === 'transferencias') this.cargarTransferencias();
    if (vista === 'movimientos') {
      if (!this.cuentaLibroId() && this.cuentasActivas().length > 0) this.cuentaLibroId.set(this.cuentasActivas()[0].id);
      this.paginaMovimientos.set(1);
      this.cargarMovimientos();
    }
  }

  protected cambiarCuentaLibro(id: string): void {
    this.cuentaLibroId.set(id);
    this.paginaMovimientos.set(1);
    this.cargarMovimientos();
  }

  protected irAMovimientos(cuenta: CuentaFinanciera): void {
    this.cuentaLibroId.set(cuenta.id);
    this.cambiarVista('movimientos');
  }

  protected cargarResumen(): void {
    this.http.get<ResumenFinanciero>('/api/finanzas/resumen', { context: SILENCIO() }).subscribe({
      next: (resumen) => this.resumen.set(resumen),
      error: (error: unknown) => this.notificaciones.error(mensajeDeError(error, 'No se pudo cargar el resumen financiero.')),
    });
  }

  protected cargarCuentas(): void {
    this.cargandoCuentas.set(true);
    this.errorCuentas.set(null);
    this.http.get<unknown>('/api/finanzas/cuentas', {
      context: SILENCIO(),
      params: parametros({
        buscar: this.buscarCuenta().trim() || null,
        activa: this.estadoCuenta() || null,
        pagina: this.paginaCuentas(),
        tamanoPagina: 20,
      }),
    }).subscribe({
      next: (respuesta) => {
        const pagina = normalizarPagina<CuentaFinanciera>(respuesta, 20);
        this.cuentas.set(pagina.elementos);
        this.totalCuentas.set(pagina.total);
        this.cargandoCuentas.set(false);
      },
      error: (error: unknown) => {
        this.cargandoCuentas.set(false);
        this.errorCuentas.set(mensajeDeError(error, 'No se pudieron cargar las cuentas.'));
      },
    });
  }

  protected filtrarCuentas(): void {
    this.paginaCuentas.set(1);
    this.cargarCuentas();
  }

  protected abrirNuevaCuenta(): void {
    this.reiniciarEnvio();
    this.panel.set({ tipo: 'cuenta', cuenta: null });
  }

  protected editarCuenta(cuenta: CuentaFinanciera): void {
    this.reiniciarEnvio();
    this.panel.set({ tipo: 'cuenta', cuenta });
  }

  protected abrirTransferencia(): void {
    this.reiniciarEnvio();
    this.panel.set({ tipo: 'transferencia' });
  }

  protected abrirMovimientoManual(): void {
    this.reiniciarEnvio();
    this.panel.set({ tipo: 'movimiento' });
    this.cargarMetodosPago();
  }

  protected tituloPanel(): string {
    const panel = this.panel();
    if (panel?.tipo === 'transferencia') return 'Nueva transferencia';
    if (panel?.tipo === 'movimiento') return 'Registrar movimiento';
    if (panel?.tipo === 'cuenta') return panel.cuenta ? 'Editar cuenta' : 'Nueva cuenta';
    return '';
  }

  protected subtituloPanel(): string {
    if (this.panel()?.tipo === 'movimiento') return 'El método seleccionado determina la cuenta financiera que cambia.';
    return '';
  }

  protected valorInicialCuenta(): Record<string, unknown> {
    const panel = this.panel();
    if (panel?.tipo !== 'cuenta' || !panel.cuenta) {
      return { codigoMoneda: this.moneda(), naturaleza: 'Otro' };
    }
    const { nombre, tipo, codigoMoneda, entidad, ultimosDigitos, cupoCredito } = panel.cuenta;
    const metodo = this.metodosPagoActivos().find((item) => item.cuentaFinancieraId === panel.cuenta!.id && item.activo)
      ?? this.metodosPagoActivos().find((item) => item.activo && item.esEfectivo === (tipo === 'Efectivo'));
    return { nombre, tipo: metodo?.id ?? '', naturaleza: tipo, codigoMoneda, entidad, ultimosDigitos, cupoCredito };
  }

  protected guardarFormulario(valor: Record<string, unknown>): void {
    const panel = this.panel() ?? (this.vista() === 'transferencias' ? { tipo: 'transferencia' as const } : null);
    if (!panel || this.enviando()) return;
    this.enviando.set(true);
    this.reiniciarEnvio();

    if (panel.tipo === 'cuenta') {
      const url = panel.cuenta ? `/api/finanzas/cuentas/${panel.cuenta.id}` : '/api/finanzas/cuentas';
      const metodoPagoId = String(valor['tipo'] ?? '');
      const tipoCuenta = String(valor['naturaleza'] ?? '');
      const payloadCuenta = {
        ...valor,
        tipo: tipoCuenta,
        metodoPagoId: metodoPagoId || null,
        cupoCredito: tipoCuenta === 'TarjetaCredito' ? valor['cupoCredito'] ?? null : null,
      };
      const peticion = panel.cuenta
        ? this.http.put<CuentaFinanciera>(url, payloadCuenta, { context: SILENCIO() })
        : this.http.post<CuentaFinanciera>(url, payloadCuenta, { context: SILENCIO() });
      peticion.subscribe({
        next: () => {
          this.enviando.set(false);
          this.panel.set(null);
          this.notificaciones.exito(panel.cuenta ? 'La cuenta se actualizó.' : 'La cuenta se creó.');
          this.cargarResumen();
          this.cargarCuentas();
          this.cargarCuentasDisponibles();
        },
        error: (error: unknown) => this.manejarErrorEnvio(error, 'No se pudo guardar la cuenta.'),
      });
      return;
    }

    if (panel.tipo === 'movimiento') {
      this.http.post<MovimientoFinanciero>('/api/finanzas/movimientos', valor, { context: SILENCIO() }).subscribe({
        next: (movimiento) => {
          this.enviando.set(false);
          this.panel.set(null);
          const metodo = this.metodosPagoActivos().find((item) => item.id === movimiento.metodoPagoId);
          if (metodo) this.cuentaLibroId.set(metodo.cuentaFinancieraId);
          this.notificaciones.exito('El movimiento se registró en la cuenta asociada al método de pago.');
          this.cargarResumen();
          this.cargarCuentas();
          this.cargarCuentasDisponibles();
          if (this.vista() === 'movimientos') this.cargarMovimientos();
        },
        error: (error: unknown) => this.manejarErrorEnvio(error, 'No se pudo registrar el movimiento.'),
      });
      return;
    }

    if (panel.tipo === 'transferencia') {
      this.http.post('/api/finanzas/transferencias', valor, { context: SILENCIO() }).subscribe({
        next: () => {
          this.enviando.set(false);
          this.panel.set(null);
          this.notificaciones.exito('La transferencia se registró.');
          this.cargarResumen();
          this.cargarCuentas();
          this.cargarCuentasDisponibles();
          this.cargarTransferencias();
        },
        error: (error: unknown) => this.manejarErrorEnvio(error, 'No se pudo registrar la transferencia.'),
      });
    }
  }

  protected async cambiarEstado(cuenta: CuentaFinanciera): Promise<void> {
    const activar = !cuenta.activa;
    const aceptado = await this.confirmacion.confirmar({
      titulo: activar ? '¿Activar cuenta?' : '¿Desactivar cuenta?',
      mensaje: activar
        ? `«${cuenta.nombre}» volverá a estar disponible.`
        : `«${cuenta.nombre}» dejará de estar disponible. El historial de movimientos se conserva.`,
      textoAceptar: activar ? 'Activar' : 'Desactivar',
      peligro: !activar,
    });
    if (!aceptado) return;

    this.http.patch<CuentaFinanciera>(`/api/finanzas/cuentas/${cuenta.id}/estado`, { activa: activar }, { context: SILENCIO() }).subscribe({
      next: () => {
        this.notificaciones.exito(activar ? 'La cuenta se activó.' : 'La cuenta se desactivó.');
        this.cargarResumen();
        this.cargarCuentas();
        this.cargarCuentasDisponibles();
      },
      error: (error: unknown) => this.notificaciones.error(mensajeDeError(error, 'No se pudo cambiar el estado de la cuenta.')),
    });
  }

  protected cargarMovimientos(): void {
    const cuenta = this.cuentasDisponibles().find((item) => item.id === this.cuentaLibroId());
    if (!cuenta) {
      this.movimientos.set([]);
      this.totalMovimientos.set(0);
      return;
    }
    this.cargandoMovimientos.set(true);
    this.errorMovimientos.set(null);
    this.http.get<unknown>(`/api/finanzas/cuentas/${cuenta.id}/movimientos`, {
      context: SILENCIO(),
      params: parametros({
        desdeUtc: this.desdeMovimientos() ? inicioDiaUtc(this.desdeMovimientos()) : null,
        hastaUtc: this.hastaMovimientos() ? inicioDiaUtc(sumarDias(this.hastaMovimientos(), 1)) : null,
        tipo: this.tipoMovimiento() || null,
        pagina: this.paginaMovimientos(),
        tamanoPagina: 20,
      }),
    }).subscribe({
      next: (respuesta) => {
        const pagina = normalizarPagina<MovimientoFinanciero>(respuesta, 20);
        this.movimientos.set(pagina.elementos);
        this.totalMovimientos.set(pagina.total);
        this.cargandoMovimientos.set(false);
      },
      error: (error: unknown) => {
        this.cargandoMovimientos.set(false);
        this.errorMovimientos.set(mensajeDeError(error, 'No se pudieron cargar los movimientos.'));
      },
    });
  }

  protected cargarTransferencias(): void {
    this.cargandoTransferencias.set(true);
    this.errorTransferencias.set(null);
    this.http.get<unknown>('/api/finanzas/transferencias', {
      context: SILENCIO(),
      params: parametros({
        desdeUtc: this.desdeTransferencias() ? inicioDiaUtc(this.desdeTransferencias()) : null,
        hastaUtc: this.hastaTransferencias() ? inicioDiaUtc(sumarDias(this.hastaTransferencias(), 1)) : null,
        cuentaId: this.cuentaTransferencia() || null,
        pagina: this.paginaTransferencias(),
        tamanoPagina: 20,
      }),
    }).pipe(
      map((respuesta) => normalizarPagina<FilaTransferencia>(respuesta, 20)),
      catchError((error: unknown) => {
        this.cargandoTransferencias.set(false);
        this.errorTransferencias.set(mensajeDeError(error, 'No se pudieron cargar las transferencias.'));
        return of(null);
      }),
    ).subscribe((pagina) => {
      if (!pagina) return;
      this.transferencias.set(pagina.elementos);
      this.totalTransferencias.set(pagina.total);
      this.cargandoTransferencias.set(false);
    });
  }

  protected filtrarTransferencias(): void {
    this.paginaTransferencias.set(1);
    this.cargarTransferencias();
  }

  protected columnasTransferencia(): { clave: string; etiqueta: string }[] {
    const fila = this.transferencias()[0];
    if (!fila) return [];
    return Object.keys(fila)
      .filter((clave) => clave !== 'id' && !clave.endsWith('Id'))
      .map((clave) => ({ clave, etiqueta: this.etiquetaCampo(clave) }));
  }

  protected valorTransferencia(fila: FilaTransferencia, clave: string): string {
    const valor = fila[clave];
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    if (typeof valor === 'number' && /importe/i.test(clave)) {
      const moneda = typeof fila['codigoMoneda'] === 'string' ? fila['codigoMoneda'] : this.moneda();
      return this.formato(valor, moneda);
    }
    if (typeof valor === 'string' && /fecha/i.test(clave) && /^\d{4}-\d\d-\d\dT/.test(valor)) return formatearFechaHora(valor);
    return String(valor);
  }

  protected etiquetaCampo(clave: string): string {
    const etiquetas: Record<string, string> = {
      id: 'Transferencia',
      cuentaOrigenId: 'ID origen',
      cuentaOrigenNombre: 'Cuenta origen',
      cuentaDestinoId: 'ID destino',
      cuentaDestinoNombre: 'Cuenta destino',
      importe: 'Importe',
      codigoMoneda: 'Moneda',
      concepto: 'Concepto',
      referencia: 'Referencia',
      fechaUtc: 'Fecha',
      usuarioId: 'Usuario',
      usuarioNombre: 'Registrado por',
      creadoPor: 'Registrado por',
    };
    if (etiquetas[clave]) return etiquetas[clave];
    return clave.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letra) => letra.toUpperCase());
  }

  protected formato(valor: number | string | null | undefined, codigoMoneda = this.moneda()): string {
    return formatearMoneda(valor, codigoMoneda);
  }

  protected texto(valor: number | string | null | undefined): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(numero(valor));
  }

  protected readonly fechaHora = formatearFechaHora;

  protected opcionesCuentaPago(esEfectivo: boolean): OpcionCampo[] {
    const tiposPermitidos = esEfectivo ? ['Efectivo'] : ['Banco', 'Billetera', 'Otro'];
      return this.cuentasActivas()
      .filter((cuenta) => tiposPermitidos.includes(cuenta.tipo))
      .map((cuenta) => ({ valor: cuenta.id, etiqueta: `${cuenta.nombre} · ${this.nombreTipoCuenta(cuenta)}` }));
  }

  protected cerrarPanel(): void {
    if (!this.enviando()) this.panel.set(null);
  }

  private reiniciarEnvio(): void {
    this.errorEnvio.set(null);
    this.erroresCampos.set(null);
  }

  private manejarErrorEnvio(error: unknown, mensaje: string): void {
    this.enviando.set(false);
    const problema = leerProblema(error);
    this.erroresCampos.set(problema.errores ?? null);
    this.errorEnvio.set(problema.errores ? 'Revisa los campos marcados.' : mensajeDeError(error, mensaje));
  }
}
