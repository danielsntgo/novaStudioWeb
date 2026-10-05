import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { Paginador } from '../../shared/componentes/paginador';
import { Icono } from '../../shared/componentes/icono';
import { formatearCantidad, formatearMoneda } from '../../shared/formato/formato';

interface Movimiento {
  id: string;
  articuloId: string;
  nombreArticulo: string;
  tipo: string;
  cantidad: number | string;
  existenciaResultante: number | string;
  costoUnitario: number | string;
  codigoMoneda: string;
  motivo?: string | null;
  fechaCreacionUtc: string;
}

interface ArticuloBasico {
  id: string;
  nombre: string;
}

const TIPOS: Record<string, { texto: string; tono: 'azul' | 'exito' | 'aviso'; signo: string }> = {
  EntradaCompra: { texto: 'Entrada por compra', tono: 'azul', signo: '+' },
  EntradaAjuste: { texto: 'Entrada por ajuste', tono: 'exito', signo: '+' },
  SalidaAjuste: { texto: 'Salida por ajuste', tono: 'aviso', signo: '−' },
};

@Component({
  selector: 'app-movimientos-inventario',
  imports: [FormsModule, Tabla, Paginador, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fp-herramientas">
      <select class="fp-input fp-select filtro" aria-label="Artículo" [ngModel]="articuloId()" (ngModelChange)="cambiar('articulo', $event)">
        <option value="">Todos los artículos</option>
        @for (a of articulos(); track a.id) { <option [value]="a.id">{{ a.nombre }}</option> }
      </select>
      <label class="fecha">Desde <input type="date" class="fp-input" [ngModel]="desde()" (ngModelChange)="cambiar('desde', $event)" /></label>
      <label class="fecha">Hasta <input type="date" class="fp-input" [ngModel]="hasta()" (ngModelChange)="cambiar('hasta', $event)" /></label>
    </div>

    @if (error(); as mensaje) {
      <div class="fp-alerta" role="alert"><svg app-icono="alerta" [tamano]="18"></svg><span>{{ mensaje }}</span><button type="button" class="fp-enlace" (click)="cargar()">Reintentar</button></div>
    }

    <section class="fp-tarjeta fp-tarjeta--plana">
      <app-tabla [columnas]="columnas" [filas]="filas()" [cargando]="cargando()" vacioTitulo="Sin movimientos" vacioDetalle="Aquí aparecerán las entradas y salidas de inventario." />
      <app-paginador [pagina]="pagina()" [tamano]="20" [total]="total()" (cambio)="irA($event)" />
    </section>
  `,
  styles: `
    .filtro { width: auto; min-width: 200px; border-radius: 999px; padding-top: 9px; padding-bottom: 9px; font-size: 14px; }
    .fecha { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--fp-gris-700); }
    .fecha .fp-input { width: auto; padding: 8px 12px; font-size: 14px; }
  `,
})
export class MovimientosInventario implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  protected readonly filas = signal<Movimiento[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly articulos = signal<ArticuloBasico[]>([]);
  protected readonly articuloId = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly columnas: Columna<Movimiento>[] = [
    { titulo: 'Fecha', valor: (m) => formatearFechaHora(m.fechaCreacionUtc) },
    { titulo: 'Artículo', valor: (m) => m.nombreArticulo, secundario: (m) => m.motivo },
    { titulo: 'Movimiento', valor: (m) => TIPOS[m.tipo]?.texto ?? m.tipo, insignia: (m) => ({ texto: TIPOS[m.tipo]?.texto ?? m.tipo, tono: TIPOS[m.tipo]?.tono ?? 'gris' }) },
    { titulo: 'Cantidad', valor: (m) => `${TIPOS[m.tipo]?.signo ?? ''}${formatearCantidad(m.cantidad)}`, alinear: 'derecha' },
    { titulo: 'Existencia', valor: (m) => formatearCantidad(m.existenciaResultante), alinear: 'derecha', ocultarEnMovil: true },
    { titulo: 'Costo unit.', valor: (m) => formatearMoneda(m.costoUnitario, m.codigoMoneda), alinear: 'derecha', ocultarEnMovil: true },
  ];

  protected readonly rango = computed(() => ({
    desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
    // "Hasta" incluye el día completo: se envía el inicio del día siguiente.
    hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
  }));

  ngOnInit(): void {
    this.http.get<unknown>('/api/inventario/articulos', { ...this.silencio, params: parametros({ tamanoPagina: 100 }) }).subscribe({
      next: (r) => this.articulos.set(normalizarPagina<ArticuloBasico>(r).elementos),
    });
    this.cargar();
  }

  protected cambiar(campo: 'articulo' | 'desde' | 'hasta', valor: string): void {
    if (campo === 'articulo') this.articuloId.set(valor);
    if (campo === 'desde') this.desde.set(valor);
    if (campo === 'hasta') this.hasta.set(valor);
    this.pagina.set(1);
    this.cargar();
  }

  protected irA(pagina: number): void {
    this.pagina.set(pagina);
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    const params = parametros({ articuloId: this.articuloId(), ...this.rango(), pagina: this.pagina(), tamanoPagina: 20 });
    this.http.get<unknown>('/api/inventario/movimientos', { ...this.silencio, params }).subscribe({
      next: (r) => {
        const p: Pagina<Movimiento> = normalizarPagina<Movimiento>(r);
        this.filas.set(p.elementos);
        this.total.set(p.total);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudieron cargar los movimientos.'));
      },
    });
  }
}
