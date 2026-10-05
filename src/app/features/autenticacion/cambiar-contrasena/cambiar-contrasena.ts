import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { mensajeDeError } from '../../../core/api/problema';
import { SesionService } from '../../../core/auth/sesion.service';
import { NotificacionesService } from '../../../core/notificaciones/notificaciones.service';
import { CampoContrasena } from '../../../shared/componentes/campo-contrasena';
import { Icono } from '../../../shared/componentes/icono';
import { LogoFlexpos } from '../../../shared/componentes/logo-flexpos';

function coincidenYDistintas(grupo: AbstractControl): ValidationErrors | null {
  const actual = grupo.get('contrasenaActual')?.value as string;
  const nueva = grupo.get('contrasenaNueva')?.value as string;
  const confirmacion = grupo.get('confirmacion')?.value as string;
  const errores: ValidationErrors = {};
  if (nueva && confirmacion && nueva !== confirmacion) errores['noCoinciden'] = true;
  if (nueva && actual && nueva === actual) errores['igualAActual'] = true;
  return Object.keys(errores).length ? errores : null;
}

@Component({
  selector: 'app-cambiar-contrasena',
  imports: [ReactiveFormsModule, RouterLink, CampoContrasena, Icono, LogoFlexpos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cambiar-contrasena.html',
  styleUrl: './cambiar-contrasena.css',
})
export class CambiarContrasena {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly notificaciones = inject(NotificacionesService);

  /** Si es true, el usuario no puede continuar sin cambiar la contraseña (primer inicio de sesión). */
  protected readonly obligatorio = this.sesion.cambioContrasenaObligatorio;

  protected readonly formulario = this.fb.group(
    {
      contrasenaActual: ['', [Validators.required]],
      contrasenaNueva: ['', [Validators.required]],
      confirmacion: ['', [Validators.required]],
    },
    { validators: [coincidenYDistintas] },
  );

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected guardar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    if (this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);
    const { contrasenaActual, contrasenaNueva } = this.formulario.getRawValue();

    this.sesion.cambiarContrasena(contrasenaActual, contrasenaNueva).subscribe({
      next: () => {
        this.enviando.set(false);
        this.notificaciones.exito('Tu contraseña se actualizó correctamente.');
        void this.router.navigateByUrl('/');
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo cambiar la contraseña.'));
      },
    });
  }

  protected cerrarSesion(): void {
    this.sesion.cerrarSesion().subscribe(() => void this.router.navigate(['/login']));
  }
}
