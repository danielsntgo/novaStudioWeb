import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, switchMap } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { aIsoConDesfase, fechaLocalDe, formatearFechaHora, hoyLocal } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';
import { Compra } from './modelos';

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
  imports: [FormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compra-panel.html',
  styleUrl: './compra-panel.css',
})
export class CompraPanel implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  /** null = compra nueva. */
  readonly compra = input<Compra | null>(null);
  readonly guardado = output<void>();
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

  protected readonly soloLectura = computed(() => this.compra()?.estado === 'Confirmada');
  protected readonly moneda = computed(() => this.compra()?.codigoMoneda ?? 'COP');

  protected readonly totalCalculado = computed(() =>
    this.lineas().reduce((suma, l) => suma + numero(l.cantidad) * numero(l.costoUnitario), 0),
  );

  /** Primer problema de validación, o null si se puede guardar. */
  protected readonly problema = computed<string | null>(() => {
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

  protected formatoFechaHora(valor: string | null | undefined): string {
    return formatearFechaHora(valor);
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
    if (this.problema() || this.enviando()) return;
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
    if (this.problema() || this.enviando()) return;
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
