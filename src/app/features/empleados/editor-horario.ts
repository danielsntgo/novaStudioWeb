import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { numero } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { minutosDe } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';

interface IntervaloApi {
  diaSemana: number | string;
  horaInicio: string;
  horaFin: string;
}

interface Tramo {
  inicio: string;
  fin: string;
}

/** Los días se muestran de lunes a domingo; la API usa 0 = domingo ... 6 = sábado. */
const DIAS: { numero: number; nombre: string }[] = [
  { numero: 1, nombre: 'Lunes' },
  { numero: 2, nombre: 'Martes' },
  { numero: 3, nombre: 'Miércoles' },
  { numero: 4, nombre: 'Jueves' },
  { numero: 5, nombre: 'Viernes' },
  { numero: 6, nombre: 'Sábado' },
  { numero: 0, nombre: 'Domingo' },
];

@Component({
  selector: 'app-editor-horario',
  imports: [FormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-horario.html',
  styleUrl: './editor-horario.css',
})
export class EditorHorario implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);

  readonly empleadoId = input.required<string>();
  readonly cerrar = output<void>();

  protected readonly dias = DIAS;
  protected readonly tramos = signal<Record<number, Tramo[]>>({});
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly errorGuardar = signal<string | null>(null);

  /** Mensaje de validación por día (solapes o fin anterior al inicio). */
  protected readonly problemas = computed(() => {
    const salida: Record<number, string> = {};
    for (const [dia, lista] of Object.entries(this.tramos())) {
      const ordenados = lista
        .map((t) => ({ ini: minutosDe(t.inicio || '00:00'), fin: minutosDe(t.fin || '00:00'), vacio: !t.inicio || !t.fin }))
        .sort((a, b) => a.ini - b.ini);
      if (ordenados.some((t) => t.vacio)) salida[Number(dia)] = 'Completa la hora de inicio y de fin.';
      else if (ordenados.some((t) => t.fin <= t.ini)) salida[Number(dia)] = 'La hora de fin debe ser posterior a la de inicio.';
      else if (ordenados.some((t, i) => i > 0 && t.ini < ordenados[i - 1].fin)) salida[Number(dia)] = 'Los horarios de este día se cruzan.';
    }
    return salida;
  });

  protected readonly valido = computed(() => Object.keys(this.problemas()).length === 0);
  protected readonly totalTramos = computed(() => Object.values(this.tramos()).reduce((n, l) => n + l.length, 0));

  ngOnInit(): void {
    this.http
      .get<IntervaloApi[]>(`/api/empleados/${this.empleadoId()}/horario-semanal`, { context: new HttpContext().set(SILENCIAR_ERRORES, true) })
      .subscribe({
        next: (intervalos) => {
          const mapa: Record<number, Tramo[]> = {};
          for (const i of intervalos) {
            const dia = numero(i.diaSemana);
            (mapa[dia] ??= []).push({ inicio: i.horaInicio.slice(0, 5), fin: i.horaFin.slice(0, 5) });
          }
          for (const lista of Object.values(mapa)) lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
          this.tramos.set(mapa);
          this.cargando.set(false);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.errorCarga.set(mensajeDeError(err, 'No se pudo cargar el horario.'));
        },
      });
  }

  protected tramosDe(dia: number): Tramo[] {
    return this.tramos()[dia] ?? [];
  }

  protected agregar(dia: number): void {
    this.tramos.update((t) => ({ ...t, [dia]: [...(t[dia] ?? []), { inicio: '09:00', fin: '18:00' }] }));
  }

  protected quitar(dia: number, indice: number): void {
    this.tramos.update((t) => ({ ...t, [dia]: (t[dia] ?? []).filter((_, i) => i !== indice) }));
  }

  protected cambiar(dia: number, indice: number, campo: keyof Tramo, valor: string): void {
    this.tramos.update((t) => ({ ...t, [dia]: (t[dia] ?? []).map((x, i) => (i === indice ? { ...x, [campo]: valor } : x)) }));
  }

  protected lunesAViernes(): void {
    const mapa: Record<number, Tramo[]> = { ...this.tramos() };
    for (const dia of [1, 2, 3, 4, 5]) mapa[dia] = [{ inicio: '09:00', fin: '18:00' }];
    this.tramos.set(mapa);
  }

  protected limpiar(): void {
    this.tramos.set({});
  }

  protected guardar(): void {
    if (!this.valido() || this.guardando()) return;
    const intervalos: IntervaloApi[] = [];
    for (const [dia, lista] of Object.entries(this.tramos())) {
      for (const t of lista) intervalos.push({ diaSemana: Number(dia), horaInicio: `${t.inicio}:00`, horaFin: `${t.fin}:00` });
    }
    this.guardando.set(true);
    this.errorGuardar.set(null);
    this.http
      .put(`/api/empleados/${this.empleadoId()}/horario-semanal`, { intervalos }, { context: new HttpContext().set(SILENCIAR_ERRORES, true) })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.notificaciones.exito('El horario se guardó correctamente.');
          this.cerrar.emit();
        },
        error: (err: unknown) => {
          this.guardando.set(false);
          this.errorGuardar.set(mensajeDeError(err, 'No se pudo guardar el horario.'));
        },
      });
  }
}
