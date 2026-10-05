import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SesionService } from '../../core/auth/sesion.service';
import { ITEMS_MENU, itemsParaRoles } from '../../core/layout/menu';
import { Icono } from '../../shared/componentes/icono';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  private readonly sesion = inject(SesionService);

  private readonly ahora = new Date();

  protected readonly nombre = computed(() => this.sesion.usuario()?.nombre.split(' ')[0] ?? '');

  protected readonly saludo = computed(() => {
    const hora = this.ahora.getHours();
    const momento = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    return this.nombre() ? `${momento}, ${this.nombre()}` : momento;
  });

  protected readonly fecha = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(this.ahora)
    .replace(/^./, (c) => c.toUpperCase());

  protected readonly accesos = computed(() =>
    itemsParaRoles(this.sesion.usuario()?.roles ?? []).filter((item) => item.ruta !== 'inicio'),
  );

  protected readonly sinRol = computed(() => this.accesos().length === 0 && ITEMS_MENU.length > 0);
}
