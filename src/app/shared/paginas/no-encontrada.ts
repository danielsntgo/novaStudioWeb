import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '../componentes/icono';

@Component({
  selector: 'app-no-encontrada',
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fp-pagina">
      <section class="aviso fp-tarjeta">
        <span class="aviso__icono"><svg app-icono="brujula" [tamano]="30"></svg></span>
        <h2>No encontramos esta página</h2>
        <p>La dirección no existe o fue movida.</p>
        <a routerLink="/inicio">Volver al inicio</a>
      </section>
    </div>
  `,
  styleUrl: './pagina-aviso.css',
})
export class NoEncontrada {}
