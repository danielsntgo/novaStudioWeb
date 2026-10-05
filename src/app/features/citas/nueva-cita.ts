import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { aIsoConDesfase, hoyLocal } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { SelectorHorario, SeleccionHorario } from './selector-horario';

interface ClienteOpcion {
  id: string;
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
}
interface ServicioOpcion {
  id: string;
  nombre: string;
  duracionMinutos: number | string;
}

@Component({
  selector: 'app-nueva-cita',
  imports: [FormsModule, Icono, SelectorHorario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nueva-cita.html',
  styleUrl: './nueva-cita.css',
})
export class NuevaCita implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

  readonly fechaInicial = input(hoyLocal());
  readonly creada = output<void>();
  readonly cerrar = output<void>();

  protected readonly hoy = hoyLocal();
  protected readonly servicios = signal<ServicioOpcion[]>([]);
  protected readonly cliente = signal<ClienteOpcion | null>(null);
  protected readonly textoCliente = signal('');
  protected readonly resultados = signal<ClienteOpcion[]>([]);
  protected readonly buscando = signal(false);
  protected readonly listaAbierta = signal(false);
  protected readonly servicioId = signal('');
  protected readonly fecha = signal(hoyLocal());
  protected readonly horario = signal<SeleccionHorario | null>(null);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly busquedas$ = new Subject<string>();

  protected readonly servicio = computed(() => this.servicios().find((s) => s.id === this.servicioId()));
  protected readonly duracion = computed(() => numero(this.servicio()?.duracionMinutos));
  protected readonly puedeGuardar = computed(() => !!this.cliente() && !!this.servicioId() && !!this.fecha() && !!this.horario());

  constructor() {
    this.busquedas$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((texto) => {
          if (texto.trim().length < 2) {
            this.buscando.set(false);
            return of(null);
          }
          this.buscando.set(true);
          return this.http
            .get<unknown>('/api/clientes', { ...this.silencio, params: parametros({ buscar: texto.trim(), activo: true, tamanoPagina: 6 }) })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        this.buscando.set(false);
        this.resultados.set(r ? normalizarPagina<ClienteOpcion>(r).elementos : []);
      });
  }

  ngOnInit(): void {
    this.fecha.set(this.fechaInicial() < this.hoy ? this.hoy : this.fechaInicial());
    this.http.get<unknown>('/api/servicios', { ...this.silencio, params: parametros({ tamanoPagina: 100 }) }).subscribe({
      next: (r) => this.servicios.set(normalizarPagina<ServicioOpcion>(r).elementos),
    });
  }

  protected escribirCliente(texto: string): void {
    this.textoCliente.set(texto);
    this.cliente.set(null);
    this.listaAbierta.set(true);
    this.busquedas$.next(texto);
  }

  protected elegirCliente(c: ClienteOpcion): void {
    this.cliente.set(c);
    this.textoCliente.set(c.nombre);
    this.listaAbierta.set(false);
  }

  protected cerrarListaConDemora(): void {
    // Pequeña demora para que el clic en una opción se registre antes de cerrar la lista.
    setTimeout(() => this.listaAbierta.set(false), 150);
  }

  protected guardar(): void {
    const c = this.cliente();
    const h = this.horario();
    if (!c || !h || !this.puedeGuardar() || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);
    this.http
      .post('/api/citas', { clienteId: c.id, servicioId: this.servicioId(), empleadoId: h.empleadoId, inicioLocal: aIsoConDesfase(this.fecha(), h.hora) }, this.silencio)
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.notificaciones.exito('La cita se agendó correctamente.');
          this.creada.emit();
        },
        error: (err: unknown) => {
          this.enviando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudo agendar la cita.'));
        },
      });
  }
}
