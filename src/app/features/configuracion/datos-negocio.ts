import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { leerProblema, mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { CampoForm } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';

@Component({
  selector: 'app-datos-negocio',
  imports: [FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cargando()) {
      <p class="fp-texto-tenue">Cargando configuración…</p>
    } @else {
      @if (errorCarga(); as mensaje) {
        <div class="fp-alerta" role="alert">{{ mensaje }}</div>
      } @else {
        @if (sinConfigurar()) {
          <p class="aviso">Tu negocio aún no está configurado. Completa estos datos para empezar.</p>
        }
        <section class="fp-tarjeta tarjeta">
          <app-formulario-dinamico
            [campos]="campos"
            [valorInicial]="valor()"
            [enviando]="guardando()"
            [error]="errorGuardar()"
            [erroresServidor]="erroresCampos()"
            textoGuardar="Guardar configuración"
            textoCancelar="Descartar cambios"
            (guardar)="guardar($event)"
            (cancelar)="descartar()"
          />
        </section>
      }
    }
  `,
  styles: `
    .tarjeta { padding: 28px; max-width: 760px; }
    .aviso { margin-bottom: 16px; padding: 12px 14px; border-radius: 12px; background: var(--fp-azul-50); color: var(--fp-azul-800); font-size: 14.5px; }
  `,
})
export class DatosNegocio implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);

  protected readonly cargando = signal(true);
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly sinConfigurar = signal(false);
  protected readonly valor = signal<Record<string, unknown>>({ codigoMoneda: 'COP' });
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);
  protected readonly erroresCampos = signal<Record<string, string[]> | null>(null);

  protected readonly campos: CampoForm[] = [
    { nombre: 'nombreComercial', etiqueta: 'Nombre comercial', tipo: 'texto', requerido: true },
    { nombre: 'razonSocial', etiqueta: 'Razón social', tipo: 'texto', ancho: 'medio' },
    { nombre: 'identificacionFiscal', etiqueta: 'Identificación fiscal (NIT)', tipo: 'texto', ancho: 'medio' },
    { nombre: 'direccion', etiqueta: 'Dirección', tipo: 'texto' },
    { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', ancho: 'medio' },
    { nombre: 'correo', etiqueta: 'Correo electrónico', tipo: 'email', ancho: 'medio' },
    { nombre: 'codigoMoneda', etiqueta: 'Moneda (código ISO)', tipo: 'texto', requerido: true, maximo: 3, mayusculas: true, ancho: 'medio', marcador: 'COP', ayuda: 'Tres letras, por ejemplo COP o USD.' },
    { nombre: 'permitirVentaSinStock', etiqueta: 'Permitir vender sin existencias', tipo: 'casilla', ayuda: 'Si está activo, se podrá vender un producto aunque su stock sea cero.' },
    { nombre: 'permitirSaldosPendientes', etiqueta: 'Permitir ventas con saldo pendiente', tipo: 'casilla', ayuda: 'Permite guardar ventas parcialmente pagadas.' },
    { nombre: 'facturacionHabilitada', etiqueta: 'Habilitar facturación', tipo: 'casilla', ayuda: 'Permite solicitar factura además del comprobante.' },
    { nombre: 'exigirEmpleadoVentaServicio', etiqueta: 'Exigir empleado al vender servicios', tipo: 'casilla', ayuda: 'Útil para comisiones y trazabilidad por empleado.' },
    { nombre: 'comisionProductosHabilitada', etiqueta: 'Pagar comisión por venta de productos', tipo: 'casilla', deshabilitado: true, ayuda: 'El contrato actual solo permite comisiones por servicios.' },
  ];

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.http.get<Record<string, unknown>>('/api/configuracion', { context: new HttpContext().set(SILENCIAR_ERRORES, true) }).subscribe({
      next: (c) => {
        this.valor.set(c);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        // 404: el negocio todavía no tiene configuración; se muestra el formulario vacío.
        if (err instanceof HttpErrorResponse && err.status === 404) this.sinConfigurar.set(true);
        else this.errorCarga.set(mensajeDeError(err, 'No se pudo cargar la configuración.'));
      },
    });
  }

  protected descartar(): void {
    this.cargando.set(true);
    this.errorGuardar.set(null);
    this.erroresCampos.set(null);
    this.cargar();
  }

  protected guardar(valor: Record<string, unknown>): void {
    this.guardando.set(true);
    this.errorGuardar.set(null);
    this.erroresCampos.set(null);
    this.http.put<Record<string, unknown>>('/api/configuracion', valor, { context: new HttpContext().set(SILENCIAR_ERRORES, true) }).subscribe({
      next: (c) => {
        this.guardando.set(false);
        this.sinConfigurar.set(false);
        this.valor.set(c);
        this.notificaciones.exito('La configuración se guardó correctamente.');
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        const p = leerProblema(err);
        this.erroresCampos.set(p.errores ?? null);
        this.errorGuardar.set(p.errores ? 'Revisa los campos marcados.' : mensajeDeError(err, 'No se pudo guardar.'));
      },
    });
  }
}
