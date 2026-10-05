import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subject, catchError, map, switchMap, tap } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { etiquetaFecha, fechaLocalDe, horaLocalDe, hoyLocal, inicioDiaUtc, lunesDe, minutosDe, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { DetalleCita } from './detalle-cita';
import { ESTADOS_CITA, Cita } from './modelos';
import { NuevaCita } from './nueva-cita';

type Vista = 'dia' | 'semana';
type PanelCita = { tipo: 'nueva' } | { tipo: 'detalle'; cita: Cita } | null;

const PX_POR_HORA = 60;
const MAX_CITAS = 100;

interface ColumnaEmpleado {
  empleadoId: string;
  empleadoNombre: string;
  citas: Cita[];
}

interface DiaSemana {
  fecha: string;
  etiqueta: string;
  esHoy: boolean;
  citas: Cita[];
}

@Component({
  selector: 'app-citas',
  imports: [FormsModule, Icono, PanelLateral, NuevaCita, DetalleCita],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './citas.html',
  styleUrl: './citas.css',
})
export class Citas {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly vista = signal<Vista>('dia');
  protected readonly fecha = signal(hoyLocal());
  protected readonly verCanceladas = signal(false);
  protected readonly citas = signal<Cita[]>([]);
  protected readonly totalApi = signal(0);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly panel = signal<PanelCita>(null);
  protected readonly estados = ESTADOS_CITA;
  protected readonly pxPorHora = PX_POR_HORA;

  private readonly solicitudes$ = new Subject<void>();

  protected readonly inicioRango = computed(() => (this.vista() === 'dia' ? this.fecha() : lunesDe(this.fecha())));
  protected readonly finRango = computed(() => sumarDias(this.inicioRango(), this.vista() === 'dia' ? 1 : 7));

  protected readonly titulo = computed(() => {
    if (this.vista() === 'dia') return etiquetaFecha(this.fecha(), true);
    const ini = this.inicioRango();
    const fin = sumarDias(ini, 6);
    const corto = (f: string) => etiquetaFecha(f).split(', ')[1];
    return `${corto(ini)} – ${corto(fin)}`;
  });

  protected readonly esHoy = computed(() => (this.vista() === 'dia' ? this.fecha() === hoyLocal() : this.inicioRango() === lunesDe(hoyLocal())));

  private readonly visibles = computed(() =>
    this.citas()
      .filter((c) => this.verCanceladas() || c.estado !== 'Cancelada')
      .sort((a, b) => a.inicioUtc.localeCompare(b.inicioUtc)),
  );

  protected readonly cantidad = computed(() => this.visibles().length);

  // ----- Vista de día: una columna por empleado, posicionada por hora -----
  protected readonly columnas = computed<ColumnaEmpleado[]>(() => {
    const mapa = new Map<string, ColumnaEmpleado>();
    for (const c of this.visibles()) {
      const col = mapa.get(c.empleadoId) ?? { empleadoId: c.empleadoId, empleadoNombre: c.empleadoNombre, citas: [] };
      col.citas.push(c);
      mapa.set(c.empleadoId, col);
    }
    return [...mapa.values()].sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre));
  });

  protected readonly horasEje = computed(() => {
    let inicio = 8 * 60;
    let fin = 19 * 60;
    for (const c of this.visibles()) {
      inicio = Math.min(inicio, Math.floor(minutosDe(horaLocalDe(c.inicioUtc)) / 60) * 60);
      fin = Math.max(fin, Math.ceil((minutosDe(horaLocalDe(c.finUtc)) || 24 * 60) / 60) * 60);
    }
    const horas: string[] = [];
    for (let m = inicio; m <= fin; m += 60) horas.push(`${String(m / 60).padStart(2, '0')}:00`);
    return { inicio, fin, horas };
  });

  protected readonly altoCuadricula = computed(() => ((this.horasEje().fin - this.horasEje().inicio) / 60) * PX_POR_HORA);

  // ----- Vista de semana -----
  protected readonly dias = computed<DiaSemana[]>(() => {
    const ini = this.inicioRango();
    const hoy = hoyLocal();
    return Array.from({ length: 7 }, (_, i) => {
      const f = sumarDias(ini, i);
      return {
        fecha: f,
        etiqueta: etiquetaFecha(f),
        esHoy: f === hoy,
        citas: this.visibles().filter((c) => fechaLocalDe(c.inicioUtc) === f),
      };
    });
  });

  protected readonly tituloPanel = computed(() => {
    const p = this.panel();
    return p?.tipo === 'nueva' ? 'Nueva cita' : p?.tipo === 'detalle' ? 'Detalle de la cita' : '';
  });

  constructor() {
    this.solicitudes$
      .pipe(
        switchMap(() => {
          this.cargando.set(true);
          this.error.set(null);
          const params = parametros({
            desdeUtc: inicioDiaUtc(this.inicioRango()),
            hastaUtc: inicioDiaUtc(this.finRango()),
            pagina: 1,
            tamanoPagina: MAX_CITAS,
          });
          return this.http.get<unknown>('/api/citas', { params, context: new HttpContext().set(SILENCIAR_ERRORES, true) }).pipe(
            map((r) => normalizarPagina<Cita>(r, MAX_CITAS)),
            tap((p) => {
              this.citas.set(p.elementos);
              this.totalApi.set(p.total);
              this.cargando.set(false);
            }),
            catchError((err: unknown) => {
              this.cargando.set(false);
              this.error.set(mensajeDeError(err, 'No se pudo cargar la agenda.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
    this.recargar();
  }

  protected recargar(): void {
    this.solicitudes$.next();
  }

  protected cambiarVista(v: Vista): void {
    if (this.vista() === v) return;
    this.vista.set(v);
    this.recargar();
  }

  protected mover(direccion: -1 | 1): void {
    this.fecha.set(sumarDias(this.fecha(), direccion * (this.vista() === 'dia' ? 1 : 7)));
    this.recargar();
  }

  protected irAHoy(): void {
    this.fecha.set(hoyLocal());
    this.recargar();
  }

  protected elegirFecha(f: string): void {
    if (!f) return;
    this.fecha.set(f);
    this.recargar();
  }

  protected irADia(f: string): void {
    this.fecha.set(f);
    this.vista.set('dia');
    this.recargar();
  }

  protected hora(c: Cita): string {
    return `${horaLocalDe(c.inicioUtc)} – ${horaLocalDe(c.finUtc)}`;
  }

  protected horaInicio(c: Cita): string {
    return horaLocalDe(c.inicioUtc);
  }

  protected top(c: Cita): number {
    return ((minutosDe(horaLocalDe(c.inicioUtc)) - this.horasEje().inicio) / 60) * PX_POR_HORA;
  }

  protected alto(c: Cita): number {
    return Math.max(34, (numero(c.duracionMinutos) / 60) * PX_POR_HORA - 3);
  }

  protected abrirDetalle(cita: Cita): void {
    this.panel.set({ tipo: 'detalle', cita });
  }

  protected abrirNueva(): void {
    this.panel.set({ tipo: 'nueva' });
  }

  protected cerrarPanel(): void {
    this.panel.set(null);
  }

  protected alCambiar(): void {
    this.panel.set(null);
    this.recargar();
  }

  protected get citaDetalle(): Cita | null {
    const p = this.panel();
    return p?.tipo === 'detalle' ? p.cita : null;
  }

  protected get hayMas(): boolean {
    return this.totalApi() > MAX_CITAS;
  }
}
