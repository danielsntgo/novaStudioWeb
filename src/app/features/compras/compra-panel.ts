import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, switchMap } from 'rxjs';
import { CatalogosService, MetodoPagoOpcion } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { aIsoConDesfase, fechaLocalDe, formatearFechaHora, hoyLocal } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PagoEditable, PagosEditor, pagosParaApi, problemaDePagos } from '../../shared/componentes/pagos-editor';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';
import { Compra } from './modelos';

type ModoDetalle = 'ver' | 'devolver' | 'anular';

interface OpcionProveedor {
  id: string;
  nombre: string;
}
interface OpcionArticulo {
  id: string;
  nombre: string;
  unidadBase: string;
  manejaFraccion: boolean;
}
interface LineaEditable {
  articuloId: string;
  cantidad: number | null;
  costoUnitario: number | null;
}

/** Formulario de una compra: datos generales, líneas de artículos y confirmación. */
@Component({
  selector: 'app-compra-panel',
  imports: [FormsModule, Icono, PagosEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compra-panel.html',
  styleUrl: './compra-panel.css',
})
export class CompraPanel implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly catalogos = inject(CatalogosService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  /** null = compra nueva. */
  readonly compra = input<Compra | null>(null);
  readonly guardado = output<void>();
  readonly actualizada = output<Compra>();
  readonly cerrar = output<void>();

  protected readonly proveedores = signal<OpcionProveedor[]>([]);
  protected readonly articulos = signal<OpcionArticulo[]>([]);
  protected readonly cargandoListas = signal(true);

  protected readonly proveedorId = signal('');
  protected readonly fecha = signal(hoyLocal());
  protected readonly referencia = signal('');
  protected readonly observacion = signal('');
  protected readonly lineas = signal<LineaEditable[]>([]);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly modoDetalle = signal<ModoDetalle>('ver');
  protected readonly metodos = signal<MetodoPagoOpcion[] | null | undefined>(undefined);
  protected readonly pagos = signal<PagoEditable[]>([]);
  protected readonly motivo = signal('');
  protected readonly cantidades = signal<Record<string, number | null>>({});

  protected readonly soloLectura = computed(() => {
    const estado = this.compra()?.estado;
    return !!estado && estado !== 'Borrador';
  });
  protected readonly moneda = computed(() => this.compra()?.codigoMoneda ?? 'COP');
  protected readonly puedeOperarCompra = computed(() => ['Confirmada', 'ParcialmenteDevuelta'].includes(this.compra()?.estado ?? ''));

  protected readonly totalCalculado = computed(() =>
    this.lineas().reduce((suma, l) => suma + numero(l.cantidad) * numero(l.costoUnitario), 0),
  );

  private readonly cantidadesDevueltas = computed(() => {
    const mapa: Record<string, number> = {};
    for (const devolucion of this.compra()?.devoluciones ?? [])
      for (const linea of devolucion.lineas)
        mapa[linea.detalleCompraId] = (mapa[linea.detalleCompraId] ?? 0) + numero(linea.cantidad);
    return mapa;
  });

  private readonly importesDevueltos = computed(() => {
    const mapa: Record<string, number> = {};
    for (const devolucion of this.compra()?.devoluciones ?? [])
      for (const linea of devolucion.lineas)
        mapa[linea.detalleCompraId] = (mapa[linea.detalleCompraId] ?? 0) + numero(linea.importe);
    return mapa;
  });

  protected readonly lineasDevolubles = computed(() => (this.compra()?.detalles ?? [])
    .map((linea) => ({ linea, disponible: Math.max(0, numero(linea.cantidad) - (this.cantidadesDevueltas()[linea.id] ?? 0)) }))
    .filter((x) => x.disponible > 0));

  protected readonly importeADevolver = computed(() => {
    let total = 0;
    for (const { linea, disponible } of this.lineasDevolubles()) {
      const cantidad = Math.min(numero(this.cantidades()[linea.id]), disponible);
      if (cantidad > 0) {
        const importeRestante = Math.max(0, numero(linea.totalLinea) - (this.importesDevueltos()[linea.id] ?? 0));
        const importeLinea = cantidad >= disponible
          ? importeRestante
          : Math.min(importeRestante, Math.round(numero(linea.totalLinea) * cantidad / numero(linea.cantidad) * 100) / 100);
        total += importeLinea;
      }
    }
    return Math.round(total * 100) / 100;
  });

  protected readonly importeOperacion = computed(() => this.modoDetalle() === 'anular'
    ? numero(this.compra()?.saldoNeto)
    : this.importeADevolver());

  /** Primer problema de validación, o null si se puede guardar. */
  protected readonly problemaBorrador = computed<string | null>(() => {
    if (!this.proveedorId()) return 'Selecciona un proveedor.';
    if (!this.fecha()) return 'Indica la fecha de la compra.';
    for (const [i, l] of this.lineas().entries()) {
      const n = i + 1;
      if (!l.articuloId) return `Línea ${n}: selecciona un artículo.`;
      if (numero(l.cantidad) <= 0) return `Línea ${n}: la cantidad debe ser mayor que cero.`;
      if (l.costoUnitario === null || numero(l.costoUnitario) < 0) return `Línea ${n}: indica el costo unitario.`;
    }
    return null;
  });

  ngOnInit(): void {
    const c = this.compra();
    if (c) {
      this.proveedorId.set(c.proveedorId);
      this.fecha.set(fechaLocalDe(c.fechaCompraUtc));
      this.referencia.set(c.referencia ?? '');
      this.observacion.set(c.observacion ?? '');
      this.lineas.set(c.detalles.map((d) => ({ articuloId: d.articuloId, cantidad: numero(d.cantidad), costoUnitario: numero(d.costoUnitario) })));
    } else {
      this.agregarLinea();
    }

    if (!this.soloLectura()) {
      this.http.get<unknown>('/api/proveedores', { ...this.silencio, params: parametros({ activo: true, tamanoPagina: 100 }) }).subscribe({
        next: (r) => this.proveedores.set(normalizarPagina<OpcionProveedor>(r).elementos),
      });
      this.http.get<unknown>('/api/inventario/articulos', { ...this.silencio, params: parametros({ activo: true, tamanoPagina: 100 }) }).subscribe({
        next: (r) => {
          this.articulos.set(normalizarPagina<OpcionArticulo>(r).elementos);
          this.cargandoListas.set(false);
        },
        error: () => this.cargandoListas.set(false),
      });
    } else {
      this.cargandoListas.set(false);
    }
  }

  protected articulo(id: string): OpcionArticulo | undefined {
    return this.articulos().find((a) => a.id === id);
  }

  protected agregarLinea(): void {
    this.lineas.update((l) => [...l, { articuloId: '', cantidad: 1, costoUnitario: null }]);
  }

  protected quitarLinea(indice: number): void {
    this.lineas.update((l) => l.filter((_, i) => i !== indice));
  }

  protected cambiarLinea(indice: number, cambios: Partial<LineaEditable>): void {
    this.lineas.update((l) => l.map((x, i) => (i === indice ? { ...x, ...cambios } : x)));
  }

  protected totalLinea(l: LineaEditable): number {
    return numero(l.cantidad) * numero(l.costoUnitario);
  }

  protected formatoMoneda(valor: number | string): string {
    return formatearMoneda(valor, this.moneda());
  }

  protected formatoCantidad(valor: number | string): string {
    return formatearCantidad(valor);
  }

  protected fechaHora(valor: string | null | undefined): string {
    return formatearFechaHora(valor);
  }

  protected num(valor: number | string | null | undefined): number {
    return numero(valor);
  }

  protected nombreLinea(detalleCompraId: string): string {
    return this.compra()?.detalles.find((linea) => linea.id === detalleCompraId)?.nombreArticulo ?? 'Artículo';
  }

  protected formatoFechaHora(valor: string | null | undefined): string {
    return formatearFechaHora(valor);
  }

  protected iniciarAccion(modo: Exclude<ModoDetalle, 'ver'>): void {
    this.error.set(null);
    this.motivo.set('');
    this.cantidades.set({});
    this.modoDetalle.set(modo);
    this.cargarMetodos();
    this.prepararPagos();
  }

  protected volverAlDetalle(): void {
    if (this.enviando()) return;
    this.modoDetalle.set('ver');
    this.error.set(null);
  }

  private cargarMetodos(): void {
    if (this.metodos() !== undefined) return;
    this.catalogos.metodosPago().subscribe({
      next: (metodos) => {
        this.metodos.set(metodos ?? []);
        this.ajustarPago();
      },
      error: () => this.metodos.set(null),
    });
  }

  private prepararPagos(): void {
    const metodoPagoId = this.metodos()?.find((metodo) => metodo.esEfectivo)?.id ?? this.metodos()?.[0]?.id ?? '';
    const importe = this.importeOperacion();
    this.pagos.set([{ metodoPagoId, importe: importe > 0 ? importe : null, referencia: '' }]);
  }

  private ajustarPago(): void {
    const actuales = this.pagos();
    if (actuales.length === 1) {
      const importe = this.importeOperacion();
      const metodoPagoId = actuales[0].metodoPagoId || this.metodos()?.find((metodo) => metodo.esEfectivo)?.id || this.metodos()?.[0]?.id || '';
      this.pagos.set([{ ...actuales[0], metodoPagoId, importe: importe > 0 ? importe : null }]);
    }
  }

  protected cambiarCantidad(id: string, valor: number | null, maximo: number): void {
    const cantidad = valor === null ? null : Math.min(Math.max(Math.round(valor * 1000) / 1000, 0), maximo);
    this.cantidades.update((actuales) => ({ ...actuales, [id]: cantidad }));
    this.ajustarPago();
  }

  protected devolverTodo(): void {
    this.cantidades.set(Object.fromEntries(this.lineasDevolubles().map(({ linea, disponible }) => [linea.id, disponible])));
    this.ajustarPago();
  }

  protected readonly problemaOperacion = computed<string | null>(() => {
    if (this.modoDetalle() === 'ver') return null;
    if (!this.motivo().trim()) return 'Escribe el motivo.';
    if (this.motivo().trim().length > 250) return 'El motivo admite hasta 250 caracteres.';
    if (this.modoDetalle() === 'devolver' && !this.lineasDevolubles().some(({ linea, disponible }) => Math.min(numero(this.cantidades()[linea.id]), disponible) > 0)) {
      return 'Indica la cantidad de al menos una línea a devolver.';
    }
    const importe = this.importeOperacion();
    if (importe <= 0) return null;
    const metodos = this.metodos();
    if (metodos === undefined) return 'Cargando métodos de pago…';
    if (metodos === null || metodos.length === 0) return 'No hay métodos de pago activos para registrar el reintegro.';
    const pagos = this.pagos().filter((pago) => numero(pago.importe) > 0 || !!pago.referencia.trim() || !!pago.metodoPagoId);
    if (pagos.length === 0) return 'Agrega al menos un método para el reintegro.';
    const errorPagos = problemaDePagos(pagos, metodos);
    if (errorPagos) return errorPagos;
    const suma = Math.round(pagos.reduce((total, pago) => total + numero(pago.importe), 0) * 100) / 100;
    if (Math.abs(suma - importe) > 0.005) return `El reintegro debe ser exactamente ${this.dinero(importe)}.`;
    return null;
  });

  protected dinero(valor: number | string | null | undefined): string {
    return formatearMoneda(valor ?? 0, this.moneda());
  }

  protected async devolver(): Promise<void> {
    if (this.problemaOperacion() || this.enviando()) return;
    const compra = this.compra();
    if (!compra) return;
    const lineas = this.lineasDevolubles().map(({ linea, disponible }) => ({
      detalleCompraId: linea.id,
      cantidad: Math.min(numero(this.cantidades()[linea.id]), disponible),
    })).filter((linea) => linea.cantidad > 0);
    const aceptado = await this.confirmacion.confirmar({
      titulo: '¿Registrar la devolución de compra?',
      mensaje: `Se retirarán del inventario los artículos devueltos y se registrará un reembolso de ${this.dinero(this.importeADevolver())} en la cuenta asociada al método seleccionado. No se puede deshacer.`,
      textoAceptar: 'Registrar devolución',
      peligro: true,
    });
    if (!aceptado) return;
    const pagos = this.importeOperacion() > 0 ? pagosParaApi(this.pagos().filter((pago) => numero(pago.importe) > 0)) : [];
    this.ejecutar(this.http.post<Compra>(`/api/compras/${compra.id}/devoluciones`, {
      motivo: this.motivo().trim(), lineas, pagos,
    }, this.silencio), 'La devolución de compra se registró correctamente.');
  }

  protected async anular(): Promise<void> {
    if (this.problemaOperacion() || this.enviando()) return;
    const compra = this.compra();
    if (!compra) return;
    const aceptado = await this.confirmacion.confirmar({
      titulo: '¿Anular la compra?',
      mensaje: `Se devolverán al proveedor las unidades que aún no se han devuelto y se registrará el reintegro de ${this.dinero(this.importeOperacion())}. La compra no se borra y esta acción no se puede deshacer.`,
      textoAceptar: 'Anular compra',
      peligro: true,
    });
    if (!aceptado) return;
    const pagos = this.importeOperacion() > 0 ? pagosParaApi(this.pagos().filter((pago) => numero(pago.importe) > 0)) : [];
    this.ejecutar(this.http.post<Compra>(`/api/compras/${compra.id}/anular`, {
      motivo: this.motivo().trim(), pagos,
    }, this.silencio), 'La compra se anuló correctamente.');
  }

  private ejecutar(peticion: Observable<Compra>, mensaje: string): void {
    this.enviando.set(true);
    this.error.set(null);
    peticion.subscribe({
      next: (compra) => {
        this.enviando.set(false);
        this.modoDetalle.set('ver');
        this.notificaciones.exito(mensaje);
        this.actualizada.emit(compra);
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo completar la operación.'));
      },
    });
  }

  private cuerpo() {
    return {
      proveedorId: this.proveedorId(),
      // Mediodía local del día elegido, para que ninguna conversión a UTC cambie la fecha.
      fechaCompraUtc: new Date(aIsoConDesfase(this.fecha(), '12:00')).toISOString(),
      referencia: this.referencia().trim() || null,
      observacion: this.observacion().trim() || null,
      detalles: this.lineas().map((l) => ({ articuloId: l.articuloId, cantidad: numero(l.cantidad), costoUnitario: numero(l.costoUnitario) })),
    };
  }

  private guardarBorrador(): Observable<Compra> {
    const c = this.compra();
    return c
      ? this.http.put<Compra>(`/api/compras/${c.id}`, this.cuerpo(), this.silencio)
      : this.http.post<Compra>('/api/compras', this.cuerpo(), this.silencio);
  }

  protected guardar(): void {
    if (this.problemaBorrador() || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.guardarBorrador().subscribe({
      next: () => {
        this.enviando.set(false);
        this.notificaciones.exito('La compra se guardó como borrador.');
        this.guardado.emit();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo guardar la compra.'));
      },
    });
  }

  protected async confirmar(): Promise<void> {
    if (this.problemaBorrador() || this.enviando()) return;
    if (this.lineas().length === 0) {
      this.error.set('Agrega al menos un artículo para confirmar la compra.');
      return;
    }
    const aceptado = await this.confirmacion.confirmar({
      titulo: '¿Confirmar la compra?',
      mensaje: 'Se registrarán las entradas en el inventario, se actualizarán las existencias y los costos, y la compra ya no podrá editarse.',
      textoAceptar: 'Confirmar compra',
    });
    if (!aceptado) return;

    this.enviando.set(true);
    this.error.set(null);
    this.guardarBorrador()
      .pipe(switchMap((guardada) => this.http.post<Compra>(`/api/compras/${guardada.id}/confirmar`, null, this.silencio)))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.notificaciones.exito('Compra confirmada. El inventario se actualizó.');
          this.guardado.emit();
        },
        error: (err: unknown) => {
          this.enviando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudo confirmar la compra.'));
        },
      });
  }
}
