import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '../componentes/icono';

@Component({
  selector: 'app-acceso-denegado',
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fp-pagina">
      <section class="aviso fp-tarjeta">
        <span class="aviso__icono"><svg app-icono="candado" [tamano]="30"></svg></span>
        <h2>No tienes acceso a esta sección</h2>
        <p>Tu rol no incluye este módulo. Si crees que es un error, habla con el administrador del negocio.</p>
        <a routerLink="/inicio">Volver al inicio</a>
      </section>
    </div>
  `,
  styleUrl: './pagina-aviso.css',
})
export class AccesoDenegado {}
