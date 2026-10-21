import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { normalizarPagina, parametros } from '../../core/api/paginas';
import { mensajeDeError } from '../../core/api/problema';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';
import { columnaEstado } from '../../shared/componentes/tabla';
import { numero } from '../../core/api/paginas';
import { OpcionCampo } from '../../shared/formularios/campos';
import { DatosNegocio } from './datos-negocio';
import { Numeracion } from './numeracion';

interface Impuesto {
  id: string;
  nombre: string;
  porcentaje: number | string;
  activo: boolean;
}

interface MetodoPago {
  id: string;
  nombre: string;
  requiereReferencia: boolean;
  esEfectivo: boolean;
  cuentaFinancieraId: string;
  cuentaFinancieraNombre: string;
  activo: boolean;
}

interface CuentaFinanciera {
  id: string;
  nombre: string;
  tipo: string;
  activa: boolean;
}

type Pestana = 'negocio' | 'impuestos' | 'pagos' | 'numeracion';

@Component({
  selector: 'app-configuracion',
  imports: [ListaCrud, DatosNegocio, Numeracion, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.css',
})
export class Configuracion implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly pestana = signal<Pestana>('negocio');
  protected readonly cuentas = signal<CuentaFinanciera[]>([]);
  protected readonly cargandoCuentas = signal(true);
  protected readonly errorCuentas = signal<string | null>(null);

  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'negocio', titulo: 'Negocio' },
    { id: 'impuestos', titulo: 'Impuestos' },
    { id: 'pagos', titulo: 'Métodos de pago' },
    { id: 'numeracion', titulo: 'Numeración' },
  ];

  protected readonly impuestos: ConfigCrud<Impuesto> = {
    titulo: 'Impuestos',
    subtitulo: 'Los impuestos disponibles para aplicar en tus ventas.',
    textoNuevo: 'Nuevo impuesto',
    singular: 'impuesto',
    nombre: (i) => i.nombre,
    urlLista: '/api/configuracion/impuestos',
    paginado: false,
    filtroActivo: false,
    incrustado: true,
    columnas: [
      { titulo: 'Impuesto', valor: (i) => i.nombre },
      { titulo: 'Porcentaje', valor: (i) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(numero(i.porcentaje))} %`, alinear: 'derecha' },
      columnaEstado<Impuesto>(),
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, marcador: 'Ej.: IVA' },
      { nombre: 'porcentaje', etiqueta: 'Porcentaje', tipo: 'decimal', requerido: true, min: 0, ayuda: 'Por ejemplo, 19 para un impuesto del 19 %.' },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    mensajeCreado: 'El impuesto se creó correctamente.',
    mensajeActualizado: 'El impuesto se actualizó correctamente.',
    vacio: { titulo: 'Sin impuestos', detalle: 'Agrega los impuestos que aplicas en tu negocio.' },
  };

  protected readonly pagos: ConfigCrud<MetodoPago> = {
    titulo: 'Métodos de pago',
    subtitulo: 'Las formas de pago que aceptas al cobrar.',
    textoNuevo: 'Nuevo método de pago',
    singular: 'método de pago',
    nombre: (m) => m.nombre,
    urlLista: '/api/configuracion/metodos-pago',
    paginado: false,
    filtroActivo: false,
    incrustado: true,
    columnas: [
      { titulo: 'Método', valor: (m) => m.nombre },
      { titulo: 'Cuenta financiera', valor: (m) => m.cuentaFinancieraNombre },
      {
        titulo: 'Tipo',
        valor: (m) => (m.esEfectivo ? 'Efectivo' : 'No efectivo'),
        insignia: (m) => ({ texto: m.esEfectivo ? 'Efectivo' : 'No efectivo', tono: m.esEfectivo ? 'exito' : 'gris' }),
        ocultarEnMovil: true,
      },
      {
        titulo: 'Referencia',
        valor: (m) => (m.requiereReferencia ? 'Obligatoria' : 'No requerida'),
        insignia: (m) => ({ texto: m.requiereReferencia ? 'Obligatoria' : 'No requerida', tono: m.requiereReferencia ? 'azul' : 'gris' }),
        ocultarEnMovil: true,
      },
      columnaEstado<MetodoPago>(),
    ],
    campos: () => [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, marcador: 'Ej.: Efectivo, Tarjeta, Transferencia' },
      { nombre: 'esEfectivo', etiqueta: 'Es pago en efectivo', tipo: 'casilla', ayuda: 'Solo puede existir un método marcado como efectivo.' },
      { nombre: 'requiereReferencia', etiqueta: 'Requiere número de referencia', tipo: 'casilla', ayuda: 'Pide el comprobante o número de transacción al cobrar.' },
      {
        nombre: 'cuentaFinancieraId',
        etiqueta: 'Cuenta financiera',
        tipo: 'seleccion',
        requerido: true,
        opcionesSegun: (valor) => this.opcionesCuentas(valor['esEfectivo'] === true),
        ayuda: 'El efectivo se asigna a una cuenta de efectivo; los demás medios a banco, billetera u otro.',
      },
    ],
    puedeCrear: true,
    puedeEditar: true,
    puedeCambiarEstado: true,
    mensajeCreado: 'El método de pago se creó correctamente.',
    mensajeActualizado: 'El método de pago se actualizó correctamente.',
    vacio: { titulo: 'Sin métodos de pago', detalle: 'Agrega al menos uno para poder cobrar.' },
  };

  ngOnInit(): void {
    this.cargarCuentas();
  }

  protected cargarCuentas(): void {
    this.cargandoCuentas.set(true);
    this.errorCuentas.set(null);
    this.http
      .get<unknown>('/api/finanzas/cuentas', {
        context: new HttpContext().set(SILENCIAR_ERRORES, true),
        params: parametros({ activa: true, pagina: 1, tamanoPagina: 100 }),
      })
      .pipe(
        map((respuesta) => normalizarPagina<CuentaFinanciera>(respuesta, 100).elementos),
        catchError((error: unknown) => {
          this.errorCuentas.set(mensajeDeError(error, 'No se pudieron cargar las cuentas financieras.'));
          return of([] as CuentaFinanciera[]);
        }),
      )
      .subscribe((cuentas) => {
        this.cuentas.set(cuentas.filter((cuenta) => cuenta.activa));
        this.cargandoCuentas.set(false);
      });
  }

  protected opcionesCuentas(esEfectivo: boolean): OpcionCampo[] {
    const tiposPermitidos = esEfectivo ? ['Efectivo'] : ['Banco', 'Billetera', 'Otro'];
    return this.cuentas()
      .filter((cuenta) => tiposPermitidos.includes(cuenta.tipo))
      .map((cuenta) => ({ valor: cuenta.id, etiqueta: `${cuenta.nombre} · ${cuenta.tipo}` }));
  }
}
