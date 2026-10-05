import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icono } from '../../shared/componentes/icono';
import { LogoFlexpos } from '../../shared/componentes/logo-flexpos';
import { SesionService } from '../auth/sesion.service';
import { GrupoMenu, ItemMenu, itemsParaRoles } from './menu';
import { TituloPaginaStrategy } from './titulo-pagina.strategy';

interface SeccionMenu {
  titulo: GrupoMenu | null;
  items: ItemMenu[];
}

/** Estructura principal: barra lateral, cabecera y contenido. */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoFlexpos, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly estrategiaTitulo = inject(TituloPaginaStrategy);

  protected readonly usuario = this.sesion.usuario;
  protected readonly titulo = this.estrategiaTitulo.tituloActual;
  protected readonly menuAbierto = signal(false);
  protected readonly menuUsuarioAbierto = signal(false);
  protected readonly cerrandoSesion = signal(false);

  protected readonly secciones = computed<SeccionMenu[]>(() => {
    const items = itemsParaRoles(this.usuario()?.roles ?? []);
    const grupos: SeccionMenu[] = [];
    for (const item of items) {
      let seccion = grupos.find((s) => s.titulo === item.grupo);
      if (!seccion) {
        seccion = { titulo: item.grupo, items: [] };
        grupos.push(seccion);
      }
      seccion.items.push(item);
    }
    return grupos;
  });

  protected readonly iniciales = computed(() => {
    const nombre = this.usuario()?.nombre ?? '';
    const partes = nombre.split(' ').filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
  });

  protected readonly rolPrincipal = computed(() => this.usuario()?.roles[0] ?? 'Sin rol');

  protected alternarMenu(): void {
    this.menuAbierto.update((v) => !v);
  }

  protected cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  protected alternarMenuUsuario(evento: Event): void {
    evento.stopPropagation();
    this.menuUsuarioAbierto.update((v) => !v);
  }

  protected irACambiarContrasena(): void {
    this.menuUsuarioAbierto.set(false);
    void this.router.navigate(['/cambiar-contrasena']);
  }

  protected cerrarSesion(): void {
    this.cerrandoSesion.set(true);
    this.sesion.cerrarSesion().subscribe(() => {
      this.menuUsuarioAbierto.set(false);
      void this.router.navigate(['/login']);
    });
  }

  @HostListener('document:click', ['$event'])
  protected alHacerClicFuera(evento: MouseEvent): void {
    const zonaUsuario = this.elemento.nativeElement.querySelector('.usuario');
    if (this.menuUsuarioAbierto() && zonaUsuario && !zonaUsuario.contains(evento.target as Node)) {
      this.menuUsuarioAbierto.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected alPulsarEscape(): void {
    this.menuUsuarioAbierto.set(false);
    this.menuAbierto.set(false);
  }
}
