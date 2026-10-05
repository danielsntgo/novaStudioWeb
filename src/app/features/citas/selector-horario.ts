import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, of, switchMap, tap } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { aIsoConDesfase, fechaLocalDe, horaDeMinutos, horaLocalDe, hoyLocal, minutosDe } from '../../core/tiempo/zona';

interface PeriodoApi {
  inicio: string;
  fin: string;
}
interface DisponibilidadApi {
  empleadoId: string;
  empleadoNombre: string;
  periodos: PeriodoApi[];
}

export interface SeleccionHorario {
  empleadoId: string;
  empleadoNombre: string;
  /** HH:mm en la zona del negocio. */
  hora: string;
}

interface EmpleadoConHoras {
  empleadoId: string;
  empleadoNombre: string;
  horas: string[];
}

const PASO_MINUTOS = 15;

/** Muestra, por empleado, las horas de inicio posibles para un servicio en una fecha. */
@Component({
  selector: 'app-selector-horario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selector-horario.html',
  styleUrl: './selector-horario.css',
})
export class SelectorHorario {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly servicioId = input.required<string>();
  readonly duracionMinutos = input.required<number>();
  /** yyyy-MM-dd */
  readonly fecha = input.required<string>();
  readonly valor = model<SeleccionHorario | null>(null);

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly disponibilidad = signal<DisponibilidadApi[]>([]);

  protected readonly empleados = computed<EmpleadoConHoras[]>(() => {
    const duracion = this.duracionMinutos();
    const esHoy = this.fecha() === hoyLocal();
    const ahora = esHoy ? minutosDe(horaLocalDe(new Date())) : -1;

    return this.disponibilidad()
      .map((e) => {
        const horas = new Set<string>();
        for (const p of e.periodos) {
          // Un periodo de otro día local (por el cambio UTC) se ignora.
          if (fechaLocalDe(p.inicio) !== this.fecha()) continue;
          const ini = minutosDe(horaLocalDe(p.inicio));
          const fin = minutosDe(horaLocalDe(p.fin)) || 24 * 60;
          const candidatos = [ini];
          for (let t = Math.ceil(ini / PASO_MINUTOS) * PASO_MINUTOS; t + duracion <= fin; t += PASO_MINUTOS) candidatos.push(t);
          for (const t of candidatos) {
            if (t + duracion <= fin && t > ahora) horas.add(horaDeMinutos(t));
          }
        }
        return { empleadoId: e.empleadoId, empleadoNombre: e.empleadoNombre, horas: [...horas].sort() };
      })
      .filter((e) => e.horas.length > 0);
  });

  constructor() {
    toObservable(computed(() => ({ servicioId: this.servicioId(), fecha: this.fecha() })))
      .pipe(
        tap(() => {
          this.valor.set(null);
          this.error.set(null);
          this.disponibilidad.set([]);
        }),
        switchMap(({ servicioId, fecha }) => {
          if (!servicioId || !fecha) return of(null);
          this.cargando.set(true);
          const params = parametros({ servicioId, fechaLocal: aIsoConDesfase(fecha, '00:00') });
          return this.http.get<DisponibilidadApi[]>('/api/citas/disponibilidad', { params, context: new HttpContext().set(SILENCIAR_ERRORES, true) }).pipe(
            catchError((err: unknown) => {
              this.cargando.set(false);
              this.error.set(mensajeDeError(err, 'No se pudo consultar la disponibilidad.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        this.cargando.set(false);
        this.disponibilidad.set(r ?? []);
      });
  }

  protected elegir(empleado: EmpleadoConHoras, hora: string): void {
    this.valor.set({ empleadoId: empleado.empleadoId, empleadoNombre: empleado.empleadoNombre, hora });
  }

  protected esElegida(empleado: EmpleadoConHoras, hora: string): boolean {
    const v = this.valor();
    return v?.empleadoId === empleado.empleadoId && v.hora === hora;
  }

  protected inicialDe(nombre: string): string {
    return (nombre.trim()[0] ?? '?').toUpperCase();
  }

  /** Redondeo para mostrar la duración en el encabezado. */
  protected get duracionTexto(): string {
    const m = numero(this.duracionMinutos());
    return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;
  }
}
