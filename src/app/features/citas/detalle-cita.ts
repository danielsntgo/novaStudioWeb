import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { numero } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { aIsoConDesfase, etiquetaFecha, fechaLocalDe, horaLocalDe, hoyLocal } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { ESTADOS_CITA, Cita, TRANSICIONES, TransicionCita, puedeReprogramar } from './modelos';
import { SelectorHorario, SeleccionHorario } from './selector-horario';

@Component({
  selector: 'app-detalle-cita',
  imports: [FormsModule, Icono, SelectorHorario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detalle-cita.html',
  styleUrl: './detalle-cita.css',
})
export class DetalleCita {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  readonly cita = input.required<Cita>();
  readonly cambio = output<void>();
  readonly cerrar = output<void>();

  protected readonly modo = signal<'ver' | 'reprogramar'>('ver');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fecha = signal('');
  protected readonly horario = signal<SeleccionHorario | null>(null);
  protected readonly hoy = hoyLocal();

  protected readonly estado = computed(() => ESTADOS_CITA[this.cita().estado] ?? { texto: this.cita().estado, tono: 'gris' as const });
  protected readonly transiciones = computed(() => TRANSICIONES[this.cita().estado] ?? []);
  protected readonly reprogramable = computed(() => puedeReprogramar(this.cita().estado));
  protected readonly duracion = computed(() => numero(this.cita().duracionMinutos));

  protected readonly diaCita = computed(() => etiquetaFecha(fechaLocalDe(this.cita().inicioUtc), true));
  protected readonly horaInicio = computed(() => horaLocalDe(this.cita().inicioUtc));
  protected readonly horaFin = computed(() => horaLocalDe(this.cita().finUtc));

  protected iniciarReprogramacion(): void {
    const actual = fechaLocalDe(this.cita().inicioUtc);
    this.fecha.set(actual < this.hoy ? this.hoy : actual);
    this.horario.set(null);
    this.error.set(null);
    this.modo.set('reprogramar');
  }

  protected async cambiarEstado(t: TransicionCita): Promise<void> {
    if (this.enviando()) return;
    if (t.confirmar) {
      const aceptado = await this.confirmacion.confirmar({ titulo: `¿${t.texto}?`, mensaje: t.confirmar, textoAceptar: t.texto, peligro: t.peligro });
      if (!aceptado) return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.http.patch(`/api/citas/${this.cita().id}/estado`, { estado: t.estado }, this.silencio).subscribe({
      next: () => {
        this.enviando.set(false);
        this.notificaciones.exito('El estado de la cita se actualizó.');
        this.cambio.emit();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo cambiar el estado.'));
      },
    });
  }

  protected reprogramar(): void {
    const h = this.horario();
    if (!h || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.http
      .put(`/api/citas/${this.cita().id}/reprogramar`, { empleadoId: h.empleadoId, inicioLocal: aIsoConDesfase(this.fecha(), h.hora) }, this.silencio)
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.notificaciones.exito('La cita se reprogramó correctamente.');
          this.cambio.emit();
        },
        error: (err: unknown) => {
          this.enviando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudo reprogramar la cita.'));
        },
      });
  }
}
