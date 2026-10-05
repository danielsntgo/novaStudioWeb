import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { formatearMoneda } from '../../shared/formato/formato';

interface DocumentoVenta {
  tipoDocumento: string;
  numero: string;
}

interface VentaFacturacion {
  id: string;
  clienteNombre?: string | null;
  clienteDocumento?: string | null;
  fechaVentaUtc: string;
  codigoMoneda: string;
  estado: string;
  total: number | string;
  documentos: DocumentoVenta[];
}

const SILENCIO = () => new HttpContext().set(SILENCIAR_ERRORES, true);

@Component({
  selector: 'app-facturacion',
  imports: [FormsModule, Icono, Tabla, Paginador],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './facturacion.html',
  styleUrl: './facturacion.css',
})
export class Facturacion implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);

  protected readonly filas = signal<VentaFacturacion[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly estado = signal('');

  protected readonly columnas: Columna<VentaFacturacion>[] = [
    { titulo: 'Fecha', valor: (v) => formatearFechaHora(v.fechaVentaUtc) },
    { titulo: 'Cliente', valor: (v) => v.clienteNombre ?? 'Consumidor final', secundario: (v) => v.clienteDocumento },
    { titulo: 'Documentos', valor: (v) => this.documentos(v), ocultarEnMovil: true },
    {
      titulo: 'Estado',
      valor: (v) => v.estado,
      insignia: (v) => ({ texto: v.estado, tono: v.estado === 'Finalizada' ? 'exito' : v.estado === 'Anulada' ? 'peligro' : 'aviso' }),
    },
    { titulo: 'Total', valor: (v) => formatearMoneda(v.total, v.codigoMoneda), alinear: 'derecha' },
  ];

  ngOnInit(): void {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.http
      .get<unknown>('/api/ventas', {
        context: SILENCIO(),
        params: parametros({
          desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
          hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
          estado: this.estado(),
          pagina: this.pagina(),
          tamanoPagina: 20,
        }),
      })
      .subscribe({
        next: (r) => {
          const p: Pagina<VentaFacturacion> = normalizarPagina<VentaFacturacion>(r);
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

  protected cambiar(campo: 'desde' | 'hasta' | 'estado', valor: string): void {
    if (campo === 'desde') this.desde.set(valor);
    if (campo === 'hasta') this.hasta.set(valor);
    if (campo === 'estado') this.estado.set(valor);
    this.pagina.set(1);
    this.cargar();
  }

  protected irA(pagina: number): void {
    this.pagina.set(pagina);
    this.cargar();
  }

  protected tieneDocumento(venta: VentaFacturacion, tipo: 'Factura' | 'Comprobante'): boolean {
    return venta.documentos.some((d) => d.tipoDocumento === tipo);
  }

  protected descargar(venta: VentaFacturacion, tipo: 'factura' | 'comprobante'): void {
    this.http.get(`/api/ventas/${venta.id}/${tipo}.pdf`, { responseType: 'blob', context: SILENCIO() }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tipo}-${venta.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: unknown) => this.notificaciones.error(mensajeDeError(err, `No se pudo descargar el ${tipo}.`)),
    });
  }

  protected documentos(venta: VentaFacturacion): string {
    return venta.documentos.length ? venta.documentos.map((d) => `${d.tipoDocumento} ${d.numero}`).join(' · ') : 'Sin documentos';
  }
}
