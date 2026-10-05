import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { SILENCIAR_ERRORES } from '../../core/api/contextos';
import { leerProblema, mensajeDeError } from '../../core/api/problema';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';
import { PanelLateral } from '../../shared/componentes/panel-lateral';
import { CampoForm } from '../../shared/formularios/campos';
import { FormularioDinamico } from '../../shared/formularios/formulario-dinamico';

type TipoDocumento = 'Factura' | 'Comprobante';

interface NumeracionDocumento {
  tipoDocumento: string;
  prefijo?: string | null;
  siguienteNumero?: number | string | null;
}

const TIPOS: { tipo: TipoDocumento; descripcion: string }[] = [
  { tipo: 'Factura', descripcion: 'Numeración de las facturas que emites.' },
  { tipo: 'Comprobante', descripcion: 'Numeración de los comprobantes de venta.' },
];

@Component({
  selector: 'app-numeracion',
  imports: [PanelLateral, FormularioDinamico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './numeracion.html',
  styleUrl: './numeracion.css',
})
export class Numeracion implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notificaciones = inject(NotificacionesService);

  protected readonly tipos = TIPOS;
  protected readonly cargando = signal(true);
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly lista = signal<NumeracionDocumento[]>([]);
  protected readonly editando = signal<TipoDocumento | null>(null);
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);
  protected readonly erroresCampos = signal<Record<string, string[]> | null>(null);

  protected readonly existente = computed(() => {
    const tipo = this.editando();
    return tipo ? this.buscar(tipo) : undefined;
  });

  protected readonly campos = computed<CampoForm[]>(() => {
    const campos: CampoForm[] = [
      { nombre: 'prefijo', etiqueta: 'Prefijo', tipo: 'texto', requerido: true, mayusculas: true, marcador: 'Ej.: FAC', ayuda: 'Letras que anteceden al número, como FAC-0001.' },
    ];
    if (!this.existente()) {
      campos.push({ nombre: 'siguienteNumero', etiqueta: 'Primer número', tipo: 'numero', requerido: true, min: 1, valorPorDefecto: 1, ayuda: 'Desde qué número empezará la numeración.' });
    }
    return campos;
  });

  protected readonly valorInicial = computed(() => ({ prefijo: this.existente()?.prefijo ?? '' }));

  ngOnInit(): void {
    this.cargar();
  }

  protected buscar(tipo: string): NumeracionDocumento | undefined {
    return this.lista().find((n) => n.tipoDocumento?.toLowerCase() === tipo.toLowerCase());
  }

  protected siguiente(n: NumeracionDocumento): string {
    return n.siguienteNumero === null || n.siguienteNumero === undefined ? '—' : String(n.siguienteNumero);
  }

  private cargar(): void {
    this.http.get<unknown>('/api/configuracion/numeraciones-documento', { context: new HttpContext().set(SILENCIAR_ERRORES, true) }).subscribe({
      next: (r) => {
        this.lista.set(Array.isArray(r) ? (r as NumeracionDocumento[]) : []);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.errorCarga.set(mensajeDeError(err, 'No se pudo cargar la numeración.'));
      },
    });
  }

  protected abrir(tipo: TipoDocumento): void {
    this.errorGuardar.set(null);
    this.erroresCampos.set(null);
    this.editando.set(tipo);
  }

  protected guardar(valor: Record<string, unknown>): void {
    const tipo = this.editando();
    if (!tipo || this.guardando()) return;
    const contexto = { context: new HttpContext().set(SILENCIAR_ERRORES, true) };
    this.guardando.set(true);
    this.errorGuardar.set(null);

    const peticion = this.existente()
      ? this.http.put(`/api/configuracion/numeraciones-documento/${tipo}`, { prefijo: valor['prefijo'] }, contexto)
      : this.http.post('/api/configuracion/numeraciones-documento', { tipoDocumento: tipo, prefijo: valor['prefijo'], siguienteNumero: valor['siguienteNumero'] }, contexto);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.editando.set(null);
        this.notificaciones.exito('La numeración se guardó correctamente.');
        this.cargar();
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
