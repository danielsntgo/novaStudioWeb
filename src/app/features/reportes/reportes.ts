import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogosService } from '../../core/api/catalogos.service';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { descargarArchivo } from '../../core/api/descargas';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, hoyLocal, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { ClienteOpcion, SelectorCliente } from '../../shared/componentes/selector-cliente';
import { formatearMoneda } from '../../shared/formato/formato';
import { COLUMNAS_DINERO, DefinicionReporte, FiltroReporte, FuenteOpciones, REPORTES, TONO_ESTADO, TipoReporte, esColumnaVisible, etiquetaColumna } from './config-reportes';

interface TotalReporte {
  nombre: string;
  valor: number | string;
  codigoMoneda?: string | null;
}
interface RespuestaReporte {
  tipo: string;
  nombre: string;
  generadoUtc: string;
  columnas: string[];
  filas: { valores: Record<string, unknown> }[];
  totales: TotalReporte[];
  totalRegistros: number | string;
  limite: number | string;
  truncado: boolean;
}
type Opciones = { valor: string; etiqueta: string }[];

const PASO_FILAS = 100;

@Component({
  selector: 'app-reportes',
  imports: [FormsModule, Icono, SelectorCliente],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes {
  private readonly http = inject(HttpClient);
  private readonly catalogos = inject(CatalogosService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  protected readonly definiciones = REPORTES;
  protected readonly tipo = signal<TipoReporte>('ventas');
  protected readonly definicion = computed<DefinicionReporte>(() => REPORTES.find((r) => r.tipo === this.tipo())!);

  protected readonly desde = signal(sumarDias(hoyLocal(), -29));
  protected readonly hasta = signal(hoyLocal());
  protected readonly valores = signal<Record<string, string>>({});
  protected readonly cliente = signal<ClienteOpcion | null>(null);
  protected readonly opciones = signal<Partial<Record<FuenteOpciones, Opciones>>>({});

  protected readonly resultado = signal<RespuestaReporte | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exportando = signal<string | null>(null);
  protected readonly mostrar = signal(PASO_FILAS);

  protected readonly columnas = computed(() => (this.resultado()?.columnas ?? []).filter(esColumnaVisible));
  protected readonly filasVisibles = computed(() => (this.resultado()?.filas ?? []).slice(0, this.mostrar()));
  protected readonly hayMasFilas = computed(() => (this.resultado()?.filas.length ?? 0) > this.mostrar());
  protected readonly rangoInvalido = computed(() => this.definicion().fechas && !!this.desde() && !!this.hasta() && this.hasta() < this.desde());

  constructor() {
    this.seleccionar('ventas');
  }

  protected seleccionar(tipo: TipoReporte): void {
    this.tipo.set(tipo);
    this.valores.set({});
    this.cliente.set(null);
    this.resultado.set(null);
    this.error.set(null);
    this.mostrar.set(PASO_FILAS);
    for (const f of this.definicion().filtros) this.cargarOpciones(f.fuente);
    this.generar();
  }

  protected opcionesDe(f: FiltroReporte): Opciones {
    return f.fuente === 'fija' ? (f.opciones ?? []) : (this.opciones()[f.fuente] ?? []);
  }

  private cargarOpciones(fuente: FuenteOpciones): void {
    if (fuente === 'fija' || fuente === 'clientes' || this.opciones()[fuente]) return;
    const guardar = (lista: Opciones) => this.opciones.update((o) => ({ ...o, [fuente]: lista }));
    const desdePagina = (url: string, extra: Record<string, string | number | boolean> = {}) =>
      this.http
        .get<unknown>(url, { ...this.silencio, params: parametros({ tamanoPagina: 100, ...extra }) })
        .subscribe({ next: (r) => guardar(normalizarPagina<{ id: string; nombre: string }>(r).elementos.map((x) => ({ valor: x.id, etiqueta: x.nombre }))), error: () => guardar([]) });
    switch (fuente) {
      case 'empleados': this.catalogos.empleados().subscribe((l) => guardar((l ?? []).map((x) => ({ valor: x.id, etiqueta: x.nombre })))); break;
      case 'metodosPago': this.catalogos.metodosPago().subscribe((l) => guardar((l ?? []).map((x) => ({ valor: x.id, etiqueta: x.nombre })))); break;
      case 'servicios': desdePagina('/api/servicios/administracion'); break;
      case 'articulos': desdePagina('/api/inventario/articulos'); break;
      case 'proveedores': desdePagina('/api/proveedores'); break;
    }
  }

  protected cambiarValor(param: string, valor: string): void {
    this.valores.update((v) => ({ ...v, [param]: valor }));
    this.generar();
  }

  protected cambiarFecha(campo: 'desde' | 'hasta', valor: string): void {
    if (campo === 'desde') this.desde.set(valor);
    else this.hasta.set(valor);
    this.generar();
  }

  protected alElegirCliente(c: ClienteOpcion | null): void {
    this.cliente.set(c);
    this.generar();
  }

  private parametrosConsulta(extra: Record<string, string> = {}): HttpParams {
    const d = this.definicion();
    const base: Record<string, string | null> = { ...this.valores() };
    if (d.fechas) {
      base['desdeUtc'] = this.desde() ? inicioDiaUtc(this.desde()) : null;
      // "hasta" incluye el día completo: se envía el último milisegundo de ese día.
      base['hastaUtc'] = this.hasta() ? new Date(new Date(inicioDiaUtc(sumarDias(this.hasta(), 1))).getTime() - 1).toISOString() : null;
    }
    if (d.filtros.some((f) => f.param === 'clienteId') && this.cliente()) base['clienteId'] = this.cliente()!.id;
    return parametros({ ...base, ...extra });
  }

  protected generar(): void {
    if (this.rangoInvalido()) {
      this.error.set('La fecha «hasta» no puede ser anterior a «desde».');
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.mostrar.set(PASO_FILAS);
    const tipo = this.tipo();
    this.http.get<RespuestaReporte>(`/api/reportes/${tipo}`, { ...this.silencio, params: this.parametrosConsulta() }).subscribe({
      next: (r) => {
        if (tipo !== this.tipo()) return; // el usuario cambió de informe mientras cargaba
        this.resultado.set(r);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        if (tipo !== this.tipo()) return;
        this.cargando.set(false);
        this.resultado.set(null);
        this.error.set(mensajeDeError(err, 'No se pudo generar el informe.'));
      },
    });
  }

  protected exportar(formato: 'pdf' | 'xlsx' | 'csv'): void {
    this.exportando.set(formato);
    descargarArchivo(this.http, `/api/reportes/${this.tipo()}/exportar`, `${this.tipo()}.${formato}`, this.parametrosConsulta({ formato })).subscribe({
      next: () => this.exportando.set(null),
      error: (err: unknown) => {
        this.exportando.set(null);
        this.notificaciones.error(mensajeDeError(err, 'No se pudo exportar el informe.'));
      },
    });
  }

  // ----- Presentación de celdas -----
  protected etiqueta = etiquetaColumna;

  protected celda(fila: { valores: Record<string, unknown> }, columna: string): string {
    const v = fila.valores[columna];
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (/Utc$/.test(columna) && typeof v === 'string') return formatearFechaHora(v);
    if (COLUMNAS_DINERO.has(columna) && (typeof v === 'number' || typeof v === 'string')) return formatearMoneda(v, String(fila.valores['Moneda'] ?? 'COP'));
    if (typeof v === 'number') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(v);
    return String(v);
  }

  protected tono(fila: { valores: Record<string, unknown> }, columna: string): string | null {
    const v = fila.valores[columna];
    if (typeof v !== 'string') return null;
    if (!['Estado', 'Tipo', 'Movimiento'].includes(columna)) return null;
    return TONO_ESTADO[v] ?? 'gris';
  }

  protected alineada(columna: string, fila?: { valores: Record<string, unknown> }): boolean {
    if (COLUMNAS_DINERO.has(columna)) return true;
    const v = fila?.valores[columna];
    return typeof v === 'number';
  }

  protected totalFormateado(t: TotalReporte): string {
    if (t.codigoMoneda) return formatearMoneda(t.valor, t.codigoMoneda);
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(numero(t.valor));
  }

  protected masFilas(): void {
    this.mostrar.update((n) => n + PASO_FILAS);
  }

  protected generadoEn(): string {
    const r = this.resultado();
    return r ? formatearFechaHora(r.generadoUtc) : '';
  }

  protected num(v: number | string): number {
    return numero(v);
  }
}
