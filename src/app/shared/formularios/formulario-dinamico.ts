import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Icono } from '../componentes/icono';
import { CampoForm } from './campos';

type Controles = Record<string, FormControl<unknown>>;

function validadoresDe(campo: CampoForm): ValidatorFn[] {
  const v: ValidatorFn[] = [];
  if (campo.requerido && campo.tipo !== 'casilla') v.push(Validators.required);
  if (campo.tipo === 'email') v.push(Validators.email);
  if (campo.maximo !== undefined) v.push(Validators.maxLength(campo.maximo));
  if (campo.min !== undefined) v.push(Validators.min(campo.min));
  return v;
}

function valorInicialDe(campo: CampoForm, inicial: Record<string, unknown>): unknown {
  const bruto = campo.nombre in inicial ? inicial[campo.nombre] : campo.valorPorDefecto;
  if (campo.tipo === 'casilla') return bruto === true;
  if (bruto === null || bruto === undefined) return campo.tipo === 'seleccion' ? '' : campo.tipo === 'numero' || campo.tipo === 'decimal' ? null : '';
  if (campo.tipo === 'seleccion') return String(bruto);
  return bruto;
}

/** Formulario generado a partir de una lista de campos, con validación y errores del servidor. */
@Component({
  selector: 'app-formulario-dinamico',
  imports: [ReactiveFormsModule, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './formulario-dinamico.html',
  styleUrl: './formulario-dinamico.css',
})
export class FormularioDinamico {
  readonly campos = input.required<CampoForm[]>();
  readonly valorInicial = input<Record<string, unknown>>({});
  readonly enviando = input(false);
  readonly error = input<string | null>(null);
  readonly erroresServidor = input<Record<string, string[]> | null>(null);
  readonly textoGuardar = input('Guardar');
  readonly textoCancelar = input('Cancelar');

  readonly guardar = output<Record<string, unknown>>();
  readonly cancelar = output<void>();

  /** Se incrementa con cada cambio del formulario para reevaluar la visibilidad de los campos. */
  private readonly cambios = signal(0);

  protected readonly formulario = computed(() => {
    const controles: Controles = {};
    const inicial = this.valorInicial();
    for (const campo of this.campos()) {
      controles[campo.nombre] = new FormControl<unknown>(
        { value: valorInicialDe(campo, inicial), disabled: campo.deshabilitado === true },
        validadoresDe(campo),
      );
    }
    return new FormGroup<Controles>(controles);
  });

  private readonly erroresPorCampo = computed(() => {
    const mapa = new Map<string, string>();
    for (const [clave, mensajes] of Object.entries(this.erroresServidor() ?? {})) {
      if (mensajes?.length) mapa.set(clave.toLowerCase(), mensajes[0]);
    }
    return mapa;
  });

  constructor() {
    effect((alLimpiar) => {
      const form = this.formulario();
      const aplicarVisibilidad = () => {
        const valor = form.getRawValue();
        for (const campo of this.campos()) {
          if (!campo.visibleSi) continue;
          const control = form.controls[campo.nombre];
          const visible = campo.visibleSi(valor);
          if (visible && control.disabled && !campo.deshabilitado) control.enable({ emitEvent: false });
          if (!visible && control.enabled) control.disable({ emitEvent: false });
        }
      };
      aplicarVisibilidad();
      this.cambios.update((n) => n + 1);
      const sub = form.valueChanges.subscribe(() => {
        aplicarVisibilidad();
        this.cambios.update((n) => n + 1);
      });
      alLimpiar(() => sub.unsubscribe());
    });
  }

  protected esVisible(campo: CampoForm): boolean {
    this.cambios();
    return !campo.visibleSi || campo.visibleSi(this.formulario().getRawValue());
  }

  protected tipoHtml(campo: CampoForm): string {
    switch (campo.tipo) {
      case 'email': return 'email';
      case 'telefono': return 'tel';
      case 'numero':
      case 'decimal': return 'number';
      case 'fecha': return 'date';
      case 'hora': return 'time';
      default: return 'text';
    }
  }

  protected paso(campo: CampoForm): string | null {
    if (campo.tipo === 'numero') return String(campo.paso ?? 1);
    if (campo.tipo === 'decimal') return campo.paso ? String(campo.paso) : 'any';
    return null;
  }

  protected modoTeclado(campo: CampoForm): string | null {
    return campo.tipo === 'numero' ? 'numeric' : campo.tipo === 'decimal' ? 'decimal' : null;
  }

  protected mensajeError(campo: CampoForm): string | null {
    this.cambios();
    const control = this.formulario().controls[campo.nombre];
    const servidor = this.erroresPorCampo().get(campo.nombre.toLowerCase());
    if (servidor && (!control.touched || control.pristine)) return servidor;
    if (!control.touched || !control.errors) return null;
    const e = control.errors;
    if (e['required']) return 'Este campo es obligatorio.';
    if (e['email']) return 'Escribe un correo válido.';
    if (e['min']) return `Debe ser mayor o igual a ${campo.min}.`;
    if (e['maxlength']) return `Máximo ${campo.maximo} caracteres.`;
    return 'Valor no válido.';
  }

  protected enviar(): void {
    const form = this.formulario();
    form.markAllAsTouched();
    this.cambios.update((n) => n + 1);
    if (form.invalid || this.enviando()) return;

    const resultado: Record<string, unknown> = {};
    const bruto = form.getRawValue();
    for (const campo of this.campos()) {
      if (!this.esVisible(campo)) continue;
      resultado[campo.nombre] = this.convertir(campo, bruto[campo.nombre]);
    }
    this.guardar.emit(resultado);
  }

  private convertir(campo: CampoForm, valor: unknown): unknown {
    switch (campo.tipo) {
      case 'casilla':
        return valor === true;
      case 'numero':
      case 'decimal': {
        if (valor === null || valor === undefined || valor === '') return null;
        const n = Number(valor);
        return Number.isFinite(n) ? n : null;
      }
      case 'seleccion':
        return valor === '' || valor === undefined ? null : valor;
      default: {
        const texto = typeof valor === 'string' ? valor.trim() : '';
        if (texto === '') return campo.requerido ? '' : null;
        return campo.mayusculas ? texto.toUpperCase() : texto;
      }
    }
  }
}
