import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { leerProblema, mensajeDeError } from '../../../core/api/problema';
import { esRutaInternaSegura } from '../../../core/auth/guards';
import { SesionService } from '../../../core/auth/sesion.service';
import { CampoContrasena } from '../../../shared/componentes/campo-contrasena';
import { Icono } from '../../../shared/componentes/icono';
import { LogoFlexpos } from '../../../shared/componentes/logo-flexpos';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, CampoContrasena, Icono, LogoFlexpos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly formulario = this.fb.group({
    correo: ['', [Validators.required, Validators.email]],
    contrasena: ['', [Validators.required]],
  });

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected iniciarSesion(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    if (this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);
    const { correo, contrasena } = this.formulario.getRawValue();

    this.sesion.iniciarSesion(correo.trim(), contrasena).subscribe({
      next: () => {
        this.enviando.set(false);
        if (this.sesion.cambioContrasenaObligatorio()) {
          void this.router.navigate(['/cambiar-contrasena']);
          return;
        }
        const destino = this.ruta.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(esRutaInternaSegura(destino) ? destino : '/');
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        const problema = leerProblema(err);
        this.error.set(
          problema.estado === 401
            ? 'El correo o la contraseña no son correctos.'
            : mensajeDeError(err, 'No se pudo iniciar sesión.'),
        );
      },
    });
  }
}
