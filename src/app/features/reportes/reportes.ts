import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { formatearMoneda } from '../../shared/formato/formato';

type TipoReporte = 'ventas' | 'ingresos' | 'productos' | 'servicios' | 'inventario' | 'compras' | 'caja' | 'clientes' | 'empleados' | 'comisiones';
type FormatoExportacion = 'pdf' | 'xlsx' | 'csv';

interface Opcion {
  id: string;
  nombre: string;
}

interface FilaReporte {
  valores: Record<string, unknown>;
}

interface TotalReporte {
  nombre: string;
  valor: unknown;
  codigoMoneda?: string | null;
}

interface Reporte {
  tipo: string;
  nombre: string;
  generadoUtc: string;
  desdeUtc?: string | null;
  hastaUtc?: string | null;
  columnas: string[];
  filas: FilaReporte[];
  totales: TotalReporte[];
  totalRegistros: number | string;
  limite: number | string;
  truncado: boolean;
}

const SILENCIO = () => new HttpContext().set(SILENCIAR_ERRORES, true);

const TIPOS: { id: TipoReporte; titulo: string }[] = [
  { id: 'ventas', titulo: 'Ventas' },
  { id: 'ingresos', titulo: 'Ingresos' },
  { id: 'productos', titulo: 'Productos' },
  { id: 'servicios', titulo: 'Servicios' },
  { id: 'inventario', titulo: 'Inventario' },
  { id: 'compras', titulo: 'Compras' },
  { id: 'caja', titulo: 'Caja' },
  { id: 'clientes', titulo: 'Clientes' },
  { id: 'empleados', titulo: 'Empleados' },
  { id: 'comisiones', titulo: 'Comisiones' },
];

@Component({
  selector: 'app-reportes',
  imports: [FormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);

  protected readonly tipos = TIPOS;
  protected readonly tipo = signal<TipoReporte>('ventas');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly limite = signal(5000);
  protected readonly estado = signal('');
  protected readonly clienteId = signal('');
  protected readonly empleadoId = signal('');
  protected readonly articuloId = signal('');
  protected readonly servicioId = signal('');
  protected readonly proveedorId = signal('');
  protected readonly metodoPagoId = signal('');

  protected readonly clientes = signal<Opcion[]>([]);
  protected readonly empleados = signal<Opcion[]>([]);
  protected readonly articulos = signal<Opcion[]>([]);
  protected readonly servicios = signal<Opcion[]>([]);
  protected readonly proveedores = signal<Opcion[]>([]);
  protected readonly metodos = signal<Opcion[]>([]);

  protected readonly reporte = signal<Reporte | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly exportando = signal<FormatoExportacion | null>(null);

  ngOnInit(): void {
    this.cargarOpciones();
    this.cargarReporte();
  }

  protected cargarOpciones(): void {
    forkJoin({
      clientes: this.lista<Opcion>('/api/clientes', { activo: true, tamanoPagina: 100 }),
      empleados: this.lista<Opcion>('/api/empleados', { activo: true, tamanoPagina: 100 }),
      articulos: this.lista<Opcion>('/api/inventario/articulos', { activo: true, tamanoPagina: 100 }),
      servicios: this.lista<Opcion>('/api/servicios/administracion', { activo: true, tamanoPagina: 100 }),
      proveedores: this.lista<Opcion>('/api/proveedores', { activo: true, tamanoPagina: 100 }),
      metodos: this.lista<Opcion>('/api/configuracion/metodos-pago', {}),
    }).subscribe((r) => {
      this.clientes.set(r.clientes);
      this.empleados.set(r.empleados);
      this.articulos.set(r.articulos);
      this.servicios.set(r.servicios);
      this.proveedores.set(r.proveedores);
      this.metodos.set(r.metodos);
    });
  }

  private lista<T extends Opcion>(url: string, filtros: Record<string, string | number | boolean>) {
    return this.http.get<unknown>(url, { context: SILENCIO(), params: parametros(filtros) }).pipe(
      map((r) => normalizarPagina<T>(r, 100).elementos),
      catchError(() => of([] as T[])),
    );
  }

  protected cargarReporte(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.http.get<Reporte>(`/api/reportes/${this.tipo()}`, { context: SILENCIO(), params: this.parametrosReporte() }).subscribe({
      next: (r) => {
        this.reporte.set(r);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo generar el reporte.'));
      },
    });
  }

  protected cambiarTipo(tipo: TipoReporte): void {
    this.tipo.set(tipo);
    this.estado.set('');
    this.clienteId.set('');
    this.empleadoId.set('');
    this.articuloId.set('');
    this.servicioId.set('');
    this.proveedorId.set('');
    this.metodoPagoId.set('');
    this.cargarReporte();
  }

  protected exportar(formato: FormatoExportacion): void {
    this.exportando.set(formato);
    this.http
      .get(`/api/reportes/${this.tipo()}/exportar`, {
        context: SILENCIO(),
        params: this.parametrosReporte().set('formato', formato),
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.exportando.set(null);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `reporte-${this.tipo()}.${formato}`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: (err: unknown) => {
          this.exportando.set(null);
          this.notificaciones.error(mensajeDeError(err, 'No se pudo exportar el reporte.'));
        },
      });
  }

  private parametrosReporte() {
    return parametros({
      desdeUtc: this.desde() && this.tipo() !== 'inventario' ? inicioDiaUtc(this.desde()) : null,
      hastaUtc: this.hasta() && this.tipo() !== 'inventario' ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
      clienteId: this.admiteCliente() ? this.clienteId() : null,
      empleadoId: this.admiteEmpleado() ? this.empleadoId() : null,
      articuloId: this.admiteArticulo() ? this.articuloId() : null,
      servicioId: this.admiteServicio() ? this.servicioId() : null,
      proveedorId: this.tipo() === 'compras' ? this.proveedorId() : null,
      metodoPagoId: this.tipo() === 'ingresos' ? this.metodoPagoId() : null,
      estado: this.estadosDisponibles().length ? this.estado() : null,
      limite: this.limite(),
    });
  }

  protected admiteCliente(): boolean {
    return ['ventas', 'ingresos', 'clientes'].includes(this.tipo());
  }

  protected admiteEmpleado(): boolean {
    return ['servicios', 'empleados', 'comisiones'].includes(this.tipo());
  }

  protected admiteArticulo(): boolean {
    return ['productos', 'inventario'].includes(this.tipo());
  }

  protected admiteServicio(): boolean {
    return ['servicios', 'comisiones'].includes(this.tipo());
  }

  protected estadosDisponibles(): string[] {
    switch (this.tipo()) {
      case 'ventas': return ['Finalizada', 'ParcialmenteDevuelta', 'Devuelta', 'Anulada'];
      case 'compras': return ['Borrador', 'Confirmada'];
      case 'caja': return ['Abierta', 'Cerrada'];
      case 'comisiones': return ['Pendiente', 'Pagada', 'Revertida'];
      default: return [];
    }
  }

  protected valorFila(fila: FilaReporte, columna: string): string {
    return this.valorTexto(fila.valores[columna]);
  }

  protected valorTotal(total: TotalReporte): string {
    if (total.codigoMoneda) return formatearMoneda(total.valor as number | string, total.codigoMoneda);
    return this.valorTexto(total.valor);
  }

  protected valorTexto(valor: unknown): string {
    if (valor === null || valor === undefined) return '—';
    if (typeof valor === 'number') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor);
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    if (typeof valor === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) return formatearFechaHora(valor);
      const n = Number(valor);
      if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(valor)) return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n);
      return valor;
    }
    return String(valor);
  }

  protected cantidad(valor: number | string | null | undefined): string {
    return new Intl.NumberFormat('es-CO').format(numero(valor));
  }
}
