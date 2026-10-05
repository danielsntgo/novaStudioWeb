import { Injectable, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Pone el título de la pestaña y lo expone como signal para la cabecera del layout. */
@Injectable({ providedIn: 'root' })
export class TituloPaginaStrategy extends TitleStrategy {
  private readonly titulo = inject(Title);
  readonly tituloActual = signal('');

  override updateTitle(estado: RouterStateSnapshot): void {
    const titulo = this.buildTitle(estado);
    this.tituloActual.set(titulo ?? '');
    this.titulo.setTitle(titulo ? `${titulo} · FlexPos` : 'FlexPos');
  }
}
