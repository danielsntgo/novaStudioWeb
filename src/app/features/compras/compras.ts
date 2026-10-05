import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { formatearFecha, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { formatearMoneda } from '../../shared/formato/formato';
import { CompraPanel } from './compra-panel';
import { Compra } from './modelos';

type EstadoPanel = { compra: Compra | null } | null;

@Component({
  selector: 'app-compras',
  imports: [FormsModule, Icono, Tabla, Paginador, PanelLateral, CompraPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compras.html',
  styleUrl: './compras.css',
})
export class Compras {
  private readonly http = inject(HttpClient);

  protected readonly filas = signal<Compra[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly buscar = signal('');
  protected readonly estado = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly panel = signal<EstadoPanel>(null);

  protected readonly columnas: Columna<Compra>[] = [
    { titulo: 'Fecha', valor: (c) => formatearFecha(c.fechaCompraUtc) },
    { titulo: 'Proveedor', valor: (c) => c.nombreProveedor, secundario: (c) => c.referencia },
    { titulo: 'Artículos', valor: (c) => `${c.detalles.length}`, alinear: 'centro', ocultarEnMovil: true },
    {
      titulo: 'Estado',
      valor: (c) => c.estado,
      insignia: (c) => ({ texto: c.estado === 'Confirmada' ? 'Confirmada' : 'Borrador', tono: c.estado === 'Confirmada' ? 'exito' : 'aviso' }),
    },
    { titulo: 'Total', valor: (c) => formatearMoneda(c.total, c.codigoMoneda), alinear: 'derecha' },
  ];

  protected readonly tituloPanel = computed(() => {
    const p = this.panel();
    if (!p) return '';
    if (!p.compra) return 'Nueva compra';
    return p.compra.estado === 'Confirmada' ? 'Detalle de la compra' : 'Editar compra';
  });

  protected readonly subtituloPanel = computed(() => {
    const c = this.panel()?.compra;
    return c ? `${c.nombreProveedor} · ${c.estado === 'Confirmada' ? 'Confirmada' : 'Borrador'}` : '';
  });

  private readonly busqueda = signal('');

  constructor() {
    // Búsqueda con pausa de 300 ms para no consultar con cada tecla.
    effect((alLimpiar) => {
      const texto = this.busqueda();
      const id = setTimeout(() => {
        this.buscar.set(texto);
        this.pagina.set(1);
        this.cargar();
      }, 300);
      alLimpiar(() => clearTimeout(id));
    });
    untracked(() => this.cargar());
  }

  protected alBuscar(texto: string): void {
    this.busqueda.set(texto);
  }

  protected cambiar(campo: 'estado' | 'desde' | 'hasta', valor: string): void {
    if (campo === 'estado') this.estado.set(valor);
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
    const params = parametros({
      buscar: this.buscar().trim(),
      estado: this.estado(),
      desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
      hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
      pagina: this.pagina(),
      tamanoPagina: 20,
    });
    this.http.get<unknown>('/api/compras', { params, context: new HttpContext().set(SILENCIAR_ERRORES, true) }).subscribe({
      next: (r) => {
        const p: Pagina<Compra> = normalizarPagina<Compra>(r);
        this.filas.set(p.elementos);
        this.total.set(p.total);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudieron cargar las compras.'));
      },
    });
  }

  protected abrir(compra: Compra | null): void {
    this.panel.set({ compra });
  }

  protected cerrarPanel(): void {
    this.panel.set(null);
  }

  protected alGuardar(): void {
    this.panel.set(null);
    this.cargar();
  }
}
