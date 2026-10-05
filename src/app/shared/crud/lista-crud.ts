import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { Pagina, normalizarPagina, parametros } from '../../core/api/paginas';
import { leerProblema, mensajeDeError } from '../../core/api/problema';
import { ConfirmacionService } from '../../core/confirmacion/confirmacion.service';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { Icono } from '../componentes/icono';
import { PanelLateral } from '../componentes/panel-lateral';
import { Paginador } from '../componentes/paginador';
import { Tabla } from '../componentes/tabla';
import { FormularioDinamico } from '../formularios/formulario-dinamico';
import { AccionFila, ConfigCrud } from './config-crud';

type EstadoPanel<T> =
  | { modo: 'crear' }
  | { modo: 'editar'; fila: T }
  | { modo: 'accion'; fila: T; accion: AccionFila<T> };

const SILENCIO = () => new HttpContext().set(SILENCIAR_ERRORES, true);

/**
 * Pantalla de listado reutilizable: búsqueda, filtros, paginación, alta y edición en un panel
 * lateral, activación/desactivación y acciones extra por fila. Se configura con `ConfigCrud`.
 */
@Component({
  selector: 'app-lista-crud',
  imports: [FormsModule, Icono, Tabla, Paginador, PanelLateral, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lista-crud.html',
  styleUrl: './lista-crud.css',
})
export class ListaCrud<T extends { id: string; activo?: boolean }> {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly confirmacion = inject(ConfirmacionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly config = input.required<ConfigCrud<T>>();

  /** Respuesta de la API tras crear un registro (por ejemplo, para mostrar una contraseña temporal). */
  readonly creado = output<unknown>();
  /** Acciones por fila que no llevan formulario propio. */
  readonly accion = output<{ id: string; fila: T }>();

  protected readonly filas = signal<T[]>([]);
  protected readonly total = signal(0);
  protected readonly pagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly errorCarga = signal<string | null>(null);

  protected readonly buscar = signal('');
  protected readonly activo = signal<'activos' | 'inactivos'>('activos');
  protected readonly valoresFiltros = signal<Record<string, string | boolean>>({});

  protected readonly panel = signal<EstadoPanel<T> | null>(null);
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal<string | null>(null);
  protected readonly erroresCampos = signal<Record<string, string[]> | null>(null);

  private readonly solicitudes$ = new Subject<void>();
  private readonly busquedas$ = new Subject<string>();

  protected readonly tamanoPagina = computed(() => this.config().tamanoPagina ?? 20);

  protected readonly tituloPanel = computed(() => {
    const p = this.panel();
    const c = this.config();
    if (!p) return '';
    if (p.modo === 'crear') return c.textoNuevo;
    if (p.modo === 'editar') return `Editar ${c.singular}`;
    return p.accion.formulario?.titulo(p.fila) ?? p.accion.etiqueta;
  });

  protected readonly subtituloPanel = computed(() => {
    const p = this.panel();
    if (p?.modo === 'accion') return p.accion.formulario?.subtitulo?.(p.fila) ?? '';
    if (p?.modo === 'editar') return this.config().nombre(p.fila);
    return '';
  });

  protected readonly camposPanel = computed(() => {
    const p = this.panel();
    if (p?.modo === 'accion') return p.accion.formulario?.campos ?? [];
    return this.config().campos;
  });

  protected readonly valorInicialPanel = computed<Record<string, unknown>>(() => {
    const p = this.panel();
    const c = this.config();
    if (p?.modo === 'editar') return c.aFormulario ? c.aFormulario(p.fila) : (p.fila as unknown as Record<string, unknown>);
    if (p?.modo === 'accion') return p.accion.formulario?.valorInicial?.(p.fila) ?? {};
    return {};
  });

  protected readonly textoGuardar = computed(() => {
    const p = this.panel();
    if (p?.modo === 'accion') return p.accion.formulario?.textoGuardar ?? 'Guardar';
    return p?.modo === 'crear' ? 'Crear' : 'Guardar cambios';
  });

  constructor() {
    this.solicitudes$
      .pipe(
        switchMap(() => {
          this.cargando.set(true);
          this.errorCarga.set(null);
          return this.http.get<unknown>(this.config().urlLista, { params: this.construirParametros(), context: SILENCIO() }).pipe(
            map((r) => normalizarPagina<T>(r, this.tamanoPagina())),
            tap((p: Pagina<T>) => {
              this.filas.set(p.elementos);
              this.total.set(p.total);
              this.cargando.set(false);
            }),
            catchError((err: unknown) => {
              this.cargando.set(false);
              this.errorCarga.set(mensajeDeError(err, 'No se pudo cargar la información.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.busquedas$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((texto) => {
        this.buscar.set(texto);
        this.pagina.set(1);
        this.recargar();
      });

    // Carga inicial (y recarga si cambia la configuración, por ejemplo al cambiar de rol).
    effect(() => {
      this.config();
      untracked(() => {
        this.pagina.set(1);
        this.recargar();
      });
    });
  }

  recargar(): void {
    this.solicitudes$.next();
  }

  private construirParametros() {
    const c = this.config();
    return parametros({
      buscar: this.buscar().trim() || null,
      activo: c.filtroActivo ? this.activo() === 'activos' : null,
      ...this.valoresFiltros(),
      pagina: c.paginado ? this.pagina() : null,
      tamanoPagina: c.paginado ? this.tamanoPagina() : null,
    });
  }

  protected alBuscar(texto: string): void {
    this.busquedas$.next(texto);
  }

  protected cambiarActivo(valor: 'activos' | 'inactivos'): void {
    if (this.activo() === valor) return;
    this.activo.set(valor);
    this.pagina.set(1);
    this.recargar();
  }

  protected cambiarFiltro(nombre: string, valor: string | boolean): void {
    this.valoresFiltros.update((v) => {
      const siguiente = { ...v };
      if (valor === '' || valor === false) delete siguiente[nombre];
      else siguiente[nombre] = valor;
      return siguiente;
    });
    this.pagina.set(1);
    this.recargar();
  }

  protected valorFiltro(nombre: string): string | boolean {
    return this.valoresFiltros()[nombre] ?? '';
  }

  protected irAPagina(pagina: number): void {
    this.pagina.set(pagina);
    this.recargar();
  }

  // ---------- Panel ----------
  protected abrirCrear(): void {
    this.reiniciarEnvio();
    this.panel.set({ modo: 'crear' });
  }

  protected abrirEditar(fila: T): void {
    this.reiniciarEnvio();
    this.panel.set({ modo: 'editar', fila });
  }

  protected ejecutarAccion(accion: AccionFila<T>, fila: T): void {
    if (accion.formulario) {
      this.reiniciarEnvio();
      this.panel.set({ modo: 'accion', fila, accion });
    } else {
      this.accion.emit({ id: accion.id, fila });
    }
  }

  protected cerrarPanel(): void {
    if (this.enviando()) return;
    this.panel.set(null);
  }

  private reiniciarEnvio(): void {
    this.errorEnvio.set(null);
    this.erroresCampos.set(null);
  }

  protected guardar(valor: Record<string, unknown>): void {
    const p = this.panel();
    const c = this.config();
    if (!p || this.enviando()) return;

    this.enviando.set(true);
    this.reiniciarEnvio();

    let peticion;
    let mensaje: string;
    if (p.modo === 'crear') {
      peticion = this.http.post<unknown>(c.urlCrear ?? c.urlLista, valor, { context: SILENCIO() });
      mensaje = c.mensajeCreado;
    } else if (p.modo === 'editar') {
      const url = c.urlItem ? c.urlItem(p.fila.id) : `${c.urlLista}/${p.fila.id}`;
      peticion = this.http.put<unknown>(url, valor, { context: SILENCIO() });
      mensaje = c.mensajeActualizado;
    } else {
      peticion = p.accion.formulario!.enviar(p.fila, valor);
      mensaje = p.accion.formulario!.mensajeExito;
    }

    peticion.subscribe({
      next: (respuesta) => {
        this.enviando.set(false);
        this.panel.set(null);
        this.notificaciones.exito(mensaje);
        if (p.modo === 'crear') {
          this.pagina.set(1);
          this.creado.emit(respuesta);
        }
        this.recargar();
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        const problema = leerProblema(err);
        this.erroresCampos.set(problema.errores ?? null);
        this.errorEnvio.set(problema.errores ? 'Revisa los campos marcados.' : mensajeDeError(err, 'No se pudo guardar.'));
      },
    });
  }

  // ---------- Estado ----------
  protected async cambiarEstado(fila: T): Promise<void> {
    const c = this.config();
    const desactivar = fila.activo === true;
    const aceptado = await this.confirmacion.confirmar({
      titulo: desactivar ? `¿Desactivar ${c.singular}?` : `¿Activar ${c.singular}?`,
      mensaje: desactivar
        ? `«${c.nombre(fila)}» dejará de estar disponible, pero su historial se conserva y podrás activarlo de nuevo.`
        : `«${c.nombre(fila)}» volverá a estar disponible.`,
      textoAceptar: desactivar ? 'Desactivar' : 'Activar',
      peligro: desactivar,
    });
    if (!aceptado) return;

    const url = c.urlEstado ? c.urlEstado(fila.id) : `${c.urlItem ? c.urlItem(fila.id) : `${c.urlLista}/${fila.id}`}/estado`;
    this.http.patch(url, { activo: !desactivar }, { context: SILENCIO() }).subscribe({
      next: () => {
        this.notificaciones.exito(desactivar ? 'Se desactivó correctamente.' : 'Se activó correctamente.');
        this.recargar();
      },
      error: (err: unknown) => this.notificaciones.error(mensajeDeError(err, 'No se pudo cambiar el estado.')),
    });
  }

  protected visible(accion: AccionFila<T>, fila: T): boolean {
    return !accion.visible || accion.visible(fila);
  }
}
