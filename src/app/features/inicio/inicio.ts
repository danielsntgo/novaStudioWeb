import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, numero, parametros } from '../../core/api/paginas';
import { SesionService } from '../../core/auth/sesion.service';
import { ITEMS_MENU, itemsParaRoles } from '../../core/layout/menu';
import { hoyLocal, inicioDiaUtc, sumarDias } from '../../core/tiempo/zona';
import { Icono } from '../../shared/componentes/icono';
import { formatearMoneda } from '../../shared/formato/formato';
import { Caja } from '../caja/modelos';
import { Cita } from '../citas/modelos';
import { Venta } from '../ventas/modelos';

interface TarjetaResumen {
  clave: string;
  titulo: string;
  valor: string;
  detalle: string;
  ruta: string;
  icono: string;
  tono: 'azul' | 'verde' | 'ambar' | 'gris';
}

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly http = inject(HttpClient);
  private readonly silencio = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };

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

  // ----- Resumen del día (cada tarjeta aparece solo si su consulta funciona y el rol tiene acceso) -----
  private readonly tarjetas = signal<Record<string, TarjetaResumen>>({});
  protected readonly resumen = computed(() => {
    const orden = ['caja', 'ventas', 'citas', 'stock'];
    return orden.map((k) => this.tarjetas()[k]).filter((t): t is TarjetaResumen => !!t);
  });

  ngOnInit(): void {
    const hoy = hoyLocal();
    const desdeUtc = inicioDiaUtc(hoy);
    const hastaUtc = inicioDiaUtc(sumarDias(hoy, 1));

    this.http.get<Caja | null>('/api/caja/actual', this.silencio).subscribe({
      next: (c) =>
        this.poner({
          clave: 'caja',
          titulo: 'Caja',
          valor: c ? 'Abierta' : 'Cerrada',
          detalle: c ? 'Lista para registrar ventas' : 'Ábrela para empezar a vender',
          ruta: '/caja',
          icono: 'cartera',
          tono: c ? 'verde' : 'ambar',
        }),
    });

    this.http.get<unknown>('/api/ventas', { ...this.silencio, params: parametros({ desdeUtc, hastaUtc, tamanoPagina: 100 }) }).subscribe({
      next: (r) => {
        const p = normalizarPagina<Venta>(r, 100);
        const vigentes = p.elementos.filter((v) => v.estado !== 'Anulada');
        const moneda = vigentes[0]?.codigoMoneda ?? 'COP';
        const suma = vigentes.reduce((s, v) => s + numero(v.total) - numero(v.totalDevuelto), 0);
        this.poner({
          clave: 'ventas',
          titulo: 'Ventas de hoy',
          valor: formatearMoneda(suma, moneda),
          detalle: `${vigentes.length} ${vigentes.length === 1 ? 'venta' : 'ventas'}${p.total > p.elementos.length ? ' (primeras 100)' : ''}`,
          ruta: '/ventas',
          icono: 'bolsa',
          tono: 'azul',
        });
      },
    });

    this.http.get<unknown>('/api/citas', { ...this.silencio, params: parametros({ desdeUtc, hastaUtc, tamanoPagina: 100 }) }).subscribe({
      next: (r) => {
        const citas = normalizarPagina<Cita>(r, 100).elementos.filter((c) => c.estado !== 'Cancelada');
        const porAtender = citas.filter((c) => c.estado === 'Pendiente' || c.estado === 'Confirmada').length;
        this.poner({
          clave: 'citas',
          titulo: 'Citas de hoy',
          valor: String(citas.length),
          detalle: porAtender === 0 ? 'Todas atendidas' : `${porAtender} por atender`,
          ruta: '/citas',
          icono: 'calendario',
          tono: 'azul',
        });
      },
    });

    if (this.sesion.tieneRol('Administrador')) {
      this.http.get<unknown>('/api/inventario/articulos', { ...this.silencio, params: parametros({ soloBajoMinimo: true, activo: true, tamanoPagina: 1 }) }).subscribe({
        next: (r) => {
          const total = normalizarPagina<unknown>(r, 1).total;
          this.poner({
            clave: 'stock',
            titulo: 'Stock bajo',
            valor: String(total),
            detalle: total === 0 ? 'Todo en orden' : total === 1 ? 'artículo bajo el mínimo' : 'artículos bajo el mínimo',
            ruta: '/inventario',
            icono: 'caja',
            tono: total === 0 ? 'gris' : 'ambar',
          });
        },
      });
    }
  }

  private poner(t: TarjetaResumen): void {
    this.tarjetas.update((m) => ({ ...m, [t.clave]: t }));
  }
}
