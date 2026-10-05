import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { formatearFecha } from '../../core/tiempo/zona';
import { Dialogo } from '../../shared/componentes/dialogo';
import { Icono } from '../../shared/componentes/icono';
import { columnaEstado } from '../../shared/componentes/tabla';
import { ConfigCrud } from '../../shared/crud/config-crud';
import { ListaCrud } from '../../shared/crud/lista-crud';
import { inject } from '@angular/core';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service';

export interface UsuarioAdministrado {
  id: string;
  correo: string;
  activo: boolean;
  cambioContrasenaObligatorio: boolean;
  fechaCreacionUtc: string;
}

interface RecepcionistaCreada {
  usuario: UsuarioAdministrado;
  contrasenaTemporal: string;
}

@Component({
  selector: 'app-usuarios',
  imports: [ListaCrud, Dialogo, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.css',
})
export class Usuarios {
  private readonly notificaciones = inject(NotificacionesService);
  protected readonly credencial = signal<RecepcionistaCreada | null>(null);
  protected readonly copiada = signal(false);

  protected readonly config: ConfigCrud<UsuarioAdministrado> = {
    titulo: 'Usuarios',
    subtitulo: 'Cuentas de acceso al sistema. Aquí creas a los recepcionistas.',
    textoNuevo: 'Nuevo recepcionista',
    singular: 'usuario',
    nombre: (u) => u.correo,
    urlLista: '/api/usuarios',
    urlCrear: '/api/usuarios/recepcionistas',
    urlItem: (id) => `/api/usuarios/${id}`,
    paginado: true,
    buscador: 'Buscar por correo',
    filtroActivo: false,
    columnas: [
      { titulo: 'Usuario', valor: (u) => u.correo },
      {
        titulo: 'Contraseña',
        valor: (u) => (u.cambioContrasenaObligatorio ? 'Pendiente de cambio' : 'Establecida'),
        insignia: (u) => ({ texto: u.cambioContrasenaObligatorio ? 'Pendiente de cambio' : 'Establecida', tono: u.cambioContrasenaObligatorio ? 'aviso' : 'gris' }),
        ocultarEnMovil: true,
      },
      columnaEstado<UsuarioAdministrado>(),
      { titulo: 'Creado', valor: (u) => formatearFecha(u.fechaCreacionUtc), ocultarEnMovil: true },
    ],
    campos: [
      {
        nombre: 'correo',
        etiqueta: 'Correo electrónico',
        tipo: 'email',
        requerido: true,
        ayuda: 'El sistema generará una contraseña temporal que deberá cambiar en su primer inicio de sesión.',
      },
    ],
    puedeCrear: true,
    puedeEditar: false,
    puedeCambiarEstado: true,
    mensajeCreado: 'La cuenta se creó correctamente.',
    mensajeActualizado: 'La cuenta se actualizó.',
    vacio: { titulo: 'Aún no hay usuarios', detalle: 'Crea una cuenta de recepcionista con el botón superior.' },
  };

  protected alCrear(respuesta: unknown): void {
    const r = respuesta as RecepcionistaCreada | null;
    if (r?.contrasenaTemporal) {
      this.copiada.set(false);
      this.credencial.set(r);
    }
  }

  protected async copiar(): Promise<void> {
    const c = this.credencial();
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.contrasenaTemporal);
      this.copiada.set(true);
    } catch {
      this.notificaciones.aviso('No se pudo copiar automáticamente. Selecciónala y cópiala a mano.');
    }
  }
}
