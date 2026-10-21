import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { ClienteOpcion, SelectorCliente } from '../../shared/componentes/selector-cliente';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { formatearMoneda } from '../../shared/formato/formato';
import { DetalleVenta } from './detalle-venta';
import { ESTADOS_VENTA, Venta, documentoDe } from './modelos';

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, RouterLink, Icono, Tabla, Paginador, PanelLateral, SelectorCliente, DetalleVenta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class Ventas {
  private readonly http = inject(HttpClient);

  protected readonly filas = signal<Venta[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly estado = signal('');
  protected readonly cliente = signal<ClienteOpcion | null>(null);
  protected readonly seleccionada = signal<Venta | null>(null);
  protected readonly estados = Object.entries(ESTADOS_VENTA).map(([valor, e]) => ({ valor, texto: e.texto }));

  protected readonly columnas: Columna<Venta>[] = [
    { titulo: 'Fecha', valor: (v) => formatearFechaHora(v.fechaVentaUtc) },
    { titulo: 'Comprobante', valor: (v) => documentoDe(v, 'Comprobante')?.numeroCompleto ?? '—', secundario: (v) => (documentoDe(v, 'Factura') ? `Factura ${documentoDe(v, 'Factura')!.numeroCompleto}` : null), ocultarEnMovil: true },
    { titulo: 'Cliente', valor: (v) => v.clienteNombre ?? 'Cliente general' },
    { titulo: 'Estado', valor: (v) => v.estado, insignia: (v) => ESTADOS_VENTA[v.estado] ?? { texto: v.estado, tono: 'gris' } },
    {
      titulo: 'Pendiente',
      valor: (v) => (numero(v.totalPendiente) > 0 ? formatearMoneda(v.totalPendiente, v.codigoMoneda) : '—'),
      insignia: (v) => (numero(v.totalPendiente) > 0 && v.estado !== 'Anulada' ? { texto: formatearMoneda(v.totalPendiente, v.codigoMoneda), tono: 'aviso' } : null),
      alinear: 'derecha',
      ocultarEnMovil: true,
    },
    { titulo: 'Total', valor: (v) => formatearMoneda(v.total, v.codigoMoneda), alinear: 'derecha' },
  ];

  protected readonly hayFiltros = computed(() => !!(this.desde() || this.hasta() || this.estado() || this.cliente()));

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    const params = parametros({
      desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
      hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
      clienteId: this.cliente()?.id ?? null,
      estado: this.estado(),
      pagina: this.pagina(),
      tamanoPagina: 20,
    });
    this.http.get<unknown>('/api/ventas', { params, context: new HttpContext().set(SILENCIAR_ERRORES, true) }).subscribe({
      next: (r) => {
        const p: Pagina<Venta> = normalizarPagina<Venta>(r);
        this.filas.set(p.elementos);
        this.total.set(p.total);
        this.cargando.set(false);
        // Si hay una venta abierta en el panel, se refresca con los datos nuevos.
        const abierta = this.seleccionada();
        if (abierta) this.seleccionada.set(p.elementos.find((v) => v.id === abierta.id) ?? abierta);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudieron cargar las ventas.'));
      },
    });
  }

  protected filtrar(campo: 'desde' | 'hasta' | 'estado', valor: string): void {
    if (campo === 'desde') this.desde.set(valor);
    if (campo === 'hasta') this.hasta.set(valor);
    if (campo === 'estado') this.estado.set(valor);
    this.pagina.set(1);
    this.cargar();
  }

  protected alElegirCliente(c: ClienteOpcion | null): void {
    this.cliente.set(c);
    this.pagina.set(1);
    this.cargar();
  }

  protected limpiar(): void {
    this.desde.set('');
    this.hasta.set('');
    this.estado.set('');
    this.cliente.set(null);
    this.pagina.set(1);
    this.cargar();
  }

  protected irA(p: number): void {
    this.pagina.set(p);
    this.cargar();
  }
}
