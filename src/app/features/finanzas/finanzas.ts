import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, map, of } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { leerProblema, mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { CampoForm, OpcionCampo } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';
import { formatearMoneda } from '../../shared/formato/formato';

type Vista = 'cuentas' | 'transferencias';
type TipoCuenta = 'Efectivo' | 'Banco' | 'TarjetaCredito' | 'Billetera' | 'Otro';
type Panel = { tipo: 'cuenta'; cuenta: CuentaFinanciera | null } | { tipo: 'movimientos'; cuenta: CuentaFinanciera } | { tipo: 'transferencia' } | null;

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
];

@Component({
  selector: 'app-finanzas',
  imports: [FormsModule, Icono, PanelLateral, Paginador, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './finanzas.html',
  styleUrl: './finanzas.css',
})
export class Finanzas implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);

  protected readonly vista = signal<Vista>('cuentas');
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
  protected readonly tipoCuenta = signal('');
  protected readonly estadoCuenta = signal<'true' | 'false' | ''>('true');

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
  protected readonly tiposMovimiento = TIPOS_MOVIMIENTO;
  protected readonly etiquetaMovimiento = (tipo: string): string => {
    const etiquetas: Record<string, string> = {
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
    };
    return etiquetas[tipo] ?? tipo;
  };
  protected readonly cuentasActivas = computed(() => this.cuentasDisponibles().filter((cuenta) => cuenta.activa));
  protected readonly opcionesOrigen = computed<OpcionCampo[]>(() => this.cuentasActivas()
    .filter((cuenta) => cuenta.tipo !== 'TarjetaCredito')
    .map((cuenta) => ({ valor: cuenta.id, etiqueta: `${cuenta.nombre} · ${cuenta.tipo} · ${this.formato(cuenta.saldo, cuenta.codigoMoneda)}` })));
  protected readonly camposCuenta: CampoForm[] = [
    { nombre: 'nombre', etiqueta: 'Nombre de la cuenta', tipo: 'texto', requerido: true },
    { nombre: 'tipo', etiqueta: 'Tipo de cuenta', tipo: 'seleccion', requerido: true, opciones: TIPOS_CUENTA },
    { nombre: 'codigoMoneda', etiqueta: 'Moneda', tipo: 'texto', requerido: true, maximo: 3, mayusculas: true, deshabilitado: true, marcador: 'COP', ayuda: 'Moneda configurada para el negocio.' },
    { nombre: 'entidad', etiqueta: 'Entidad financiera', tipo: 'texto' },
    { nombre: 'ultimosDigitos', etiqueta: 'Últimos dígitos', tipo: 'texto', maximo: 4, ayuda: 'Opcional; no ingreses el número completo.' },
    { nombre: 'cupoCredito', etiqueta: 'Cupo de crédito', tipo: 'decimal', min: 0, visibleSi: (valor) => valor['tipo'] === 'TarjetaCredito', ayuda: 'Opcional. Limita el saldo de deuda permitido.' },
  ];

  protected readonly camposTransferencia = computed<CampoForm[]>(() => [
    { nombre: 'cuentaOrigenId', etiqueta: 'Cuenta de origen', tipo: 'seleccion', requerido: true, opciones: this.opcionesOrigen() },
    {
      nombre: 'cuentaDestinoId',
      etiqueta: 'Cuenta de destino',
      tipo: 'seleccion',
      requerido: true,
      opcionesSegun: (valor) => this.cuentasActivas()
        .filter((cuenta) => cuenta.id !== valor['cuentaOrigenId'])
        .map((cuenta) => ({ valor: cuenta.id, etiqueta: `${cuenta.nombre} · ${cuenta.tipo} · ${this.formato(cuenta.saldo, cuenta.codigoMoneda)}` })),
    },
    { nombre: 'importe', etiqueta: 'Importe', tipo: 'decimal', requerido: true, min: 0.01, paso: 0.01 },
    { nombre: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
    { nombre: 'referencia', etiqueta: 'Referencia', tipo: 'texto' },
  ]);

  ngOnInit(): void {
    this.cargarResumen();
    this.cargarCuentas();
    this.cargarCuentasDisponibles();
    this.http.get<{ codigoMoneda?: string }>('/api/configuracion', { context: SILENCIO() }).pipe(catchError(() => of({} as { codigoMoneda?: string }))).subscribe({
      next: (configuracion) => {
        if (configuracion.codigoMoneda) this.monedaNegocio.set(configuracion.codigoMoneda);
      },
    });
  }

  private cargarCuentasDisponibles(): void {
    this.http.get<unknown>('/api/finanzas/cuentas', {
      context: SILENCIO(),
      params: parametros({ activa: true, pagina: 1, tamanoPagina: 100 }),
    }).pipe(
      map((respuesta) => normalizarPagina<CuentaFinanciera>(respuesta, 100).elementos),
      catchError(() => of([] as CuentaFinanciera[])),
    ).subscribe((cuentas) => this.cuentasDisponibles.set(cuentas));
  }

  protected cambiarVista(vista: Vista): void {
    this.vista.set(vista);
    if (vista === 'transferencias') this.cargarTransferencias();
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
        tipo: this.tipoCuenta() || null,
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

  protected abrirMovimientos(cuenta: CuentaFinanciera): void {
    this.paginaMovimientos.set(1);
    this.movimientos.set([]);
    this.desdeMovimientos.set('');
    this.hastaMovimientos.set('');
    this.tipoMovimiento.set('');
    this.panel.set({ tipo: 'movimientos', cuenta });
    this.cargarMovimientos();
  }

  protected abrirTransferencia(): void {
    this.reiniciarEnvio();
    this.panel.set({ tipo: 'transferencia' });
  }

  protected tituloPanel(): string {
    const panel = this.panel();
    if (panel?.tipo === 'movimientos') return `Movimientos · ${panel.cuenta.nombre}`;
    if (panel?.tipo === 'transferencia') return 'Nueva transferencia';
    if (panel?.tipo === 'cuenta') return panel.cuenta ? 'Editar cuenta' : 'Nueva cuenta';
    return '';
  }

  protected subtituloPanel(): string {
    const panel = this.panel();
    return panel?.tipo === 'movimientos' ? `${panel.cuenta.tipo} · ${panel.cuenta.codigoMoneda}` : '';
  }

  protected valorInicialCuenta(): Record<string, unknown> {
    const panel = this.panel();
    if (panel?.tipo !== 'cuenta' || !panel.cuenta) {
      return { codigoMoneda: this.moneda() };
    }
    const { nombre, tipo, codigoMoneda, entidad, ultimosDigitos, cupoCredito } = panel.cuenta;
    return { nombre, tipo, codigoMoneda, entidad, ultimosDigitos, cupoCredito };
  }

  protected guardarFormulario(valor: Record<string, unknown>): void {
    const panel = this.panel();
    if (!panel || this.enviando()) return;
    this.enviando.set(true);
    this.reiniciarEnvio();

    if (panel.tipo === 'cuenta') {
      const url = panel.cuenta ? `/api/finanzas/cuentas/${panel.cuenta.id}` : '/api/finanzas/cuentas';
      const payloadCuenta = {
        ...valor,
        cupoCredito: valor['tipo'] === 'TarjetaCredito' ? valor['cupoCredito'] ?? null : null,
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
    const panel = this.panel();
    if (panel?.tipo !== 'movimientos') return;
    this.cargandoMovimientos.set(true);
    this.errorMovimientos.set(null);
    this.http.get<unknown>(`/api/finanzas/cuentas/${panel.cuenta.id}/movimientos`, {
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
