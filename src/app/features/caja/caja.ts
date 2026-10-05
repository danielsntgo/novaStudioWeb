import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { formatearFechaHora, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { Paginador } from '../../shared/componentes/paginador';
import { Columna, Tabla } from '../../shared/componentes/tabla';
import { CampoForm } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';
import { formatearMoneda } from '../../shared/formato/formato';

interface CajaResumen {
  id: string;
  estado: 'Abierta' | 'Cerrada' | string;
  efectivoApertura: number | string;
  fechaAperturaUtc: string;
  efectivoEsperado?: number | string | null;
  efectivoContadoCierre?: number | string | null;
  diferenciaCierre?: number | string | null;
  fechaCierreUtc?: string | null;
}

interface MovimientoCaja {
  id: string;
  tipo: string;
  importe: number | string;
  codigoMoneda: string;
  concepto?: string | null;
  fechaUtc: string;
}

interface CajaDetalle {
  caja: CajaResumen;
  movimientos: MovimientoCaja[];
}

type Panel =
  | { tipo: 'apertura' }
  | { tipo: 'movimiento' }
  | { tipo: 'cierre' }
  | { tipo: 'detalle'; id: string }
  | null;

const SILENCIO = () => new HttpContext().set(SILENCIAR_ERRORES, true);

@Component({
  selector: 'app-caja',
  imports: [FormsModule, Icono, Tabla, Paginador, PanelLateral, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './caja.html',
  styleUrl: './caja.css',
})
export class Caja implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);

  protected readonly actual = signal<CajaResumen | null>(null);
  protected readonly cargandoActual = signal(true);
  protected readonly errorActual = signal<string | null>(null);

  protected readonly filas = signal<CajaResumen[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargandoHistorial = signal(true);
  protected readonly errorHistorial = signal<string | null>(null);
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly panel = signal<Panel>(null);
  protected readonly detalle = signal<CajaDetalle | null>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal<string | null>(null);

  protected readonly columnas: Columna<CajaResumen>[] = [
    { titulo: 'Apertura', valor: (c) => formatearFechaHora(c.fechaAperturaUtc) },
    {
      titulo: 'Estado',
      valor: (c) => c.estado,
      insignia: (c) => ({ texto: c.estado, tono: c.estado === 'Abierta' ? 'exito' : 'gris' }),
    },
    { titulo: 'Inicial', valor: (c) => formatearMoneda(c.efectivoApertura), alinear: 'derecha' },
    { titulo: 'Esperado', valor: (c) => this.monto(c.efectivoEsperado), alinear: 'derecha', ocultarEnMovil: true },
    { titulo: 'Cierre', valor: (c) => (c.fechaCierreUtc ? formatearFechaHora(c.fechaCierreUtc) : '—'), ocultarEnMovil: true },
    { titulo: 'Diferencia', valor: (c) => this.monto(c.diferenciaCierre), alinear: 'derecha' },
  ];

  protected readonly tituloPanel = computed(() => {
    const p = this.panel();
    if (p?.tipo === 'apertura') return 'Abrir caja';
    if (p?.tipo === 'movimiento') return 'Movimiento manual';
    if (p?.tipo === 'cierre') return 'Cerrar caja';
    if (p?.tipo === 'detalle') return 'Detalle de caja';
    return '';
  });

  protected readonly camposPanel = computed<CampoForm[]>(() => {
    const p = this.panel();
    if (p?.tipo === 'apertura') {
      return [{ nombre: 'efectivoInicial', etiqueta: 'Efectivo inicial', tipo: 'decimal', requerido: true, min: 0 }];
    }
    if (p?.tipo === 'movimiento') {
      return [
        {
          nombre: 'tipo',
          etiqueta: 'Tipo',
          tipo: 'seleccion',
          requerido: true,
          opciones: [
            { valor: 'IngresoManual', etiqueta: 'Ingreso manual' },
            { valor: 'EgresoManual', etiqueta: 'Egreso manual' },
          ],
        },
        { nombre: 'importe', etiqueta: 'Importe', tipo: 'decimal', requerido: true, min: 0 },
        { nombre: 'concepto', etiqueta: 'Concepto', tipo: 'texto', requerido: true, maximo: 160 },
      ];
    }
    if (p?.tipo === 'cierre') {
      return [{ nombre: 'efectivoContado', etiqueta: 'Efectivo contado', tipo: 'decimal', requerido: true, min: 0 }];
    }
    return [];
  });

  protected readonly textoGuardar = computed(() => {
    const p = this.panel();
    if (p?.tipo === 'apertura') return 'Abrir caja';
    if (p?.tipo === 'movimiento') return 'Registrar movimiento';
    if (p?.tipo === 'cierre') return 'Cerrar caja';
    return 'Guardar';
  });

  ngOnInit(): void {
    this.cargarTodo();
  }

  protected cargarTodo(): void {
    this.cargarActual();
    this.cargarHistorial();
  }

  protected cargarActual(): void {
    this.cargandoActual.set(true);
    this.errorActual.set(null);
    this.http.get<CajaResumen | null>('/api/caja/actual', { context: SILENCIO() }).subscribe({
      next: (caja) => {
        this.actual.set(caja);
        this.cargandoActual.set(false);
      },
      error: (err: unknown) => {
        this.cargandoActual.set(false);
        this.errorActual.set(mensajeDeError(err, 'No se pudo consultar la caja actual.'));
      },
    });
  }

  protected cargarHistorial(): void {
    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);
    this.http
      .get<unknown>('/api/caja', {
        context: SILENCIO(),
        params: parametros({
          desdeUtc: this.desde() ? inicioDiaUtc(this.desde()) : null,
          hastaUtc: this.hasta() ? inicioDiaUtc(sumarDias(this.hasta(), 1)) : null,
          pagina: this.pagina(),
          tamanoPagina: 20,
        }),
      })
      .subscribe({
        next: (r) => {
          const p: Pagina<CajaResumen> = normalizarPagina<CajaResumen>(r);
          this.filas.set(p.elementos);
          this.total.set(p.total);
          this.cargandoHistorial.set(false);
        },
        error: (err: unknown) => {
          this.cargandoHistorial.set(false);
          this.errorHistorial.set(mensajeDeError(err, 'No se pudo cargar el historial de caja.'));
        },
      });
  }

  protected cambiarFecha(campo: 'desde' | 'hasta', valor: string): void {
    if (campo === 'desde') this.desde.set(valor);
    else this.hasta.set(valor);
    this.pagina.set(1);
    this.cargarHistorial();
  }

  protected irA(pagina: number): void {
    this.pagina.set(pagina);
    this.cargarHistorial();
  }

  protected abrir(tipo: Exclude<Panel, { tipo: 'detalle' } | null>['tipo']): void {
    this.errorEnvio.set(null);
    this.panel.set({ tipo });
  }

  protected abrirDetalle(id: string): void {
    this.errorEnvio.set(null);
    this.detalle.set(null);
    this.cargandoDetalle.set(true);
    this.panel.set({ tipo: 'detalle', id });
    this.http.get<CajaDetalle>(`/api/caja/${id}`, { context: SILENCIO() }).subscribe({
      next: (d) => {
        this.detalle.set(d);
        this.cargandoDetalle.set(false);
      },
      error: (err: unknown) => {
        this.cargandoDetalle.set(false);
        this.errorEnvio.set(mensajeDeError(err, 'No se pudo cargar el detalle de caja.'));
      },
    });
  }

  protected cerrarPanel(): void {
    if (this.enviando()) return;
    this.panel.set(null);
  }

  protected async guardar(valor: Record<string, unknown>): Promise<void> {
    const p = this.panel();
    const caja = this.actual();
    if (!p || p.tipo === 'detalle' || this.enviando()) return;
    if ((p.tipo === 'movimiento' || p.tipo === 'cierre') && !caja) return;

    if (p.tipo === 'cierre') {
      const aceptado = await this.confirmacion.confirmar({
        titulo: '¿Cerrar caja?',
        mensaje: 'Después del cierre no se podrán registrar ventas ni movimientos manuales en esta caja.',
        textoAceptar: 'Cerrar caja',
      });
      if (!aceptado) return;
    }

    this.enviando.set(true);
    this.errorEnvio.set(null);

    const peticion: Observable<unknown> =
      p.tipo === 'apertura'
        ? this.http.post<CajaResumen>('/api/caja/aperturas', { efectivoInicial: valor['efectivoInicial'] }, { context: SILENCIO() })
        : p.tipo === 'movimiento'
          ? this.http.post<MovimientoCaja>(`/api/caja/${caja!.id}/movimientos`, valor, { context: SILENCIO() })
          : this.http.post<CajaResumen>(`/api/caja/${caja!.id}/cierre`, { efectivoContado: valor['efectivoContado'] }, { context: SILENCIO() });

    peticion.subscribe({
      next: () => {
        this.enviando.set(false);
        this.panel.set(null);
        this.notificaciones.exito(
          p.tipo === 'apertura' ? 'Caja abierta correctamente.' : p.tipo === 'movimiento' ? 'Movimiento registrado.' : 'Caja cerrada correctamente.',
        );
        this.cargarTodo();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.errorEnvio.set(mensajeDeError(err, 'No se pudo guardar la operación.'));
      },
    });
  }

  protected monto(valor: number | string | null | undefined): string {
    return valor === null || valor === undefined ? '—' : formatearMoneda(valor);
  }

  protected fecha(valor: string | null | undefined): string {
    return valor ? formatearFechaHora(valor) : '—';
  }

  protected readonly formatearMoneda = formatearMoneda;
}
