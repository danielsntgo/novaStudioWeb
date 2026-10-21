import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { descargarArchivo } from '../../core/api/descargas';
import { Pagina, normalizarPagina, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { Paginador } from '../../shared/componentes/paginador';
import { ClienteOpcion, SelectorCliente } from '../../shared/componentes/selector-cliente';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { formatearMoneda } from '../../shared/formato/formato';
import { ESTADOS_VENTA, Venta, documentoDe } from '../ventas/modelos';

/** Documentos emitidos (comprobantes y facturas). Se consultan a través de las ventas que los generaron. */
@Component({
  selector: 'app-facturacion',
  imports: [FormsModule, Icono, Tabla, Paginador, SelectorCliente],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './facturacion.html',
  styleUrl: './facturacion.css',
})
export class Facturacion {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);

  protected readonly filas = signal<Venta[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly cliente = signal<ClienteOpcion | null>(null);
  protected readonly soloFactura = signal(false);
  protected readonly descargando = signal<string | null>(null);

  protected readonly visibles = computed(() => (this.soloFactura() ? this.filas().filter((v) => !!documentoDe(v, 'Factura')) : this.filas()));
  protected readonly hayFiltros = computed(() => !!(this.desde() || this.hasta() || this.cliente() || this.soloFactura()));

  protected readonly columnas: Columna<Venta>[] = [
    { titulo: 'Emitido', valor: (v) => formatearFechaHora(documentoDe(v, 'Comprobante')?.fechaEmisionUtc ?? v.fechaVentaUtc) },
    { titulo: 'Comprobante', valor: (v) => documentoDe(v, 'Comprobante')?.numeroCompleto ?? '—' },
    {
      titulo: 'Factura',
      valor: (v) => documentoDe(v, 'Factura')?.numeroCompleto ?? 'No solicitada',
      insignia: (v) => {
        const f = documentoDe(v, 'Factura');
        return f ? { texto: f.numeroCompleto, tono: 'azul' } : { texto: 'No solicitada', tono: 'gris' };
      },
      ocultarEnMovil: true,
    },
    { titulo: 'Cliente', valor: (v) => v.clienteNombre ?? 'Cliente general', secundario: (v) => v.clienteDocumento, ocultarEnMovil: true },
    { titulo: 'Venta', valor: (v) => v.estado, insignia: (v) => ESTADOS_VENTA[v.estado] ?? { texto: v.estado, tono: 'gris' }, ocultarEnMovil: true },
    { titulo: 'Total', valor: (v) => formatearMoneda(v.total, v.codigoMoneda), alinear: 'derecha' },
  ];

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
      pagina: this.pagina(),
      tamanoPagina: 20,
    });
    this.http.get<unknown>('/api/ventas', { params, context: new HttpContext().set(SILENCIAR_ERRORES, true) }).subscribe({
      next: (r) => {
        const p: Pagina<Venta> = normalizarPagina<Venta>(r);
        this.filas.set(p.elementos);
        this.total.set(p.total);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudieron cargar los documentos.'));
      },
    });
  }

  protected filtrar(campo: 'desde' | 'hasta', valor: string): void {
    if (campo === 'desde') this.desde.set(valor);
    else this.hasta.set(valor);
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
    this.cliente.set(null);
    this.soloFactura.set(false);
    this.pagina.set(1);
    this.cargar();
  }

  protected irA(p: number): void {
    this.pagina.set(p);
    this.cargar();
  }

  protected tieneFactura(v: Venta): boolean {
    return !!documentoDe(v, 'Factura');
  }

  protected descargar(v: Venta, tipo: 'comprobante' | 'factura'): void {
    const doc = documentoDe(v, tipo === 'comprobante' ? 'Comprobante' : 'Factura');
    const clave = `${v.id}:${tipo}`;
    this.descargando.set(clave);
    descargarArchivo(this.http, `/api/ventas/${v.id}/${tipo}.pdf`, `${doc?.numeroCompleto ?? tipo}.pdf`).subscribe({
      next: () => this.descargando.set(null),
      error: (err: unknown) => {
        this.descargando.set(null);
        this.notificaciones.error(mensajeDeError(err, 'No se pudo descargar el documento.'));
      },
    });
  }

  protected enCurso(v: Venta, tipo: string): boolean {
    return this.descargando() === `${v.id}:${tipo}`;
  }
}
