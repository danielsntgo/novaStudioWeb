import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CampoForm } from './campos';
import { FormularioDinamico } from './formulario-dinamico';

@Component({
  imports: [FormularioDinamico],
  template: `<app-formulario-dinamico [campos]="campos" [valorInicial]="inicial()" [erroresServidor]="errores()" (guardar)="valor = $event" />`,
})
class Anfitrion {
  campos: CampoForm[] = [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', requerido: true, opciones: [{ valor: 'Producto', etiqueta: 'Producto' }, { valor: 'Insumo', etiqueta: 'Insumo' }] },
    { nombre: 'precio', etiqueta: 'Precio', tipo: 'decimal', requerido: true, min: 0, visibleSi: (v) => v['tipo'] === 'Producto' },
    { nombre: 'notas', etiqueta: 'Notas', tipo: 'texto' },
    { nombre: 'fraccion', etiqueta: 'Fracciones', tipo: 'casilla' },
  ];
  inicial = signal<Record<string, unknown>>({});
  errores = signal<Record<string, string[]> | null>(null);
  valor: Record<string, unknown> | null = null;
}

describe('FormularioDinamico', () => {
  function crear() {
    const f = TestBed.createComponent(Anfitrion);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    return { f, el, c: f.componentInstance };
  }
  const escribir = (el: HTMLElement, id: string, texto: string, evento = 'input') => {
    const campo = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#campo-${id}`)!;
    campo.value = texto;
    campo.dispatchEvent(new Event(evento));
  };

  it('no envía si faltan campos obligatorios y marca los errores', () => {
    const { f, el, c } = crear();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    f.detectChanges();
    expect(c.valor).toBeNull();
    expect(el.textContent).toContain('Este campo es obligatorio.');
  });

  it('el campo condicional aparece solo para Producto y se valida entonces', () => {
    const { f, el, c } = crear();
    expect(el.querySelector('#campo-precio')).toBeNull();

    escribir(el, 'nombre', 'Shampoo');
    escribir(el, 'tipo', 'Producto', 'change');
    f.detectChanges();
    expect(el.querySelector('#campo-precio')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    f.detectChanges();
    expect(c.valor).toBeNull(); // falta el precio

    escribir(el, 'precio', '38000');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    f.detectChanges();
    expect(c.valor).toEqual({ nombre: 'Shampoo', tipo: 'Producto', precio: 38000, notas: null, fraccion: false });
  });

  it('un campo oculto no se envía ni bloquea el envío', () => {
    const { f, el, c } = crear();
    escribir(el, 'nombre', 'Tinte');
    escribir(el, 'tipo', 'Insumo', 'change');
    f.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    f.detectChanges();
    expect(c.valor).toEqual({ nombre: 'Tinte', tipo: 'Insumo', notas: null, fraccion: false });
  });

  it('muestra el error que devuelve el servidor junto al campo', () => {
    const { f, el, c } = crear();
    c.errores.set({ Nombre: ['Ya existe un registro con ese nombre.'] });
    f.detectChanges();
    expect(el.textContent).toContain('Ya existe un registro con ese nombre.');
  });
});
