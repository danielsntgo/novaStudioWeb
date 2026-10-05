import { Route, Routes } from '@angular/router';
import { autenticadoGuard, invitadoGuard, rolGuard, sesionIniciadaGuard } from './core/auth/guards';
import { ITEMS_MENU } from './core/layout/menu';

/** Una ruta por módulo del menú. Hasta que se construya cada pantalla, muestra la página "pendiente". */
/** Pantallas ya construidas. El resto de módulos usa la página "pendiente". */
const MODULOS_LISTOS: Record<string, () => Promise<unknown>> = {
  clientes: () => import('./features/clientes/clientes').then((m) => m.Clientes),
  servicios: () => import('./features/servicios/servicios').then((m) => m.Servicios),
  empleados: () => import('./features/empleados/empleados').then((m) => m.Empleados),
  usuarios: () => import('./features/usuarios/usuarios').then((m) => m.Usuarios),
  inventario: () => import('./features/inventario/inventario').then((m) => m.Inventario),
  compras: () => import('./features/compras/compras').then((m) => m.Compras),
  citas: () => import('./features/citas/citas').then((m) => m.Citas),
  caja: () => import('./features/caja/caja').then((m) => m.Caja),
  ventas: () => import('./features/ventas/ventas').then((m) => m.Ventas),
  facturacion: () => import('./features/facturacion/facturacion').then((m) => m.Facturacion),
  comisiones: () => import('./features/comisiones/comisiones').then((m) => m.Comisiones),
  reportes: () => import('./features/reportes/reportes').then((m) => m.Reportes),
  proveedores: () => import('./features/proveedores/proveedores').then((m) => m.Proveedores),
  configuracion: () => import('./features/configuracion/configuracion').then((m) => m.Configuracion),
};

const rutasDeModulos: Routes = ITEMS_MENU.filter((item) => item.ruta !== 'inicio').map((item) => ({
  path: item.ruta,
  title: item.titulo,
  canActivate: [rolGuard(...item.roles)],
  loadComponent: (MODULOS_LISTOS[item.ruta] ?? (() => import('./features/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente))) as Route['loadComponent'],
  data: { modulo: item.titulo, icono: item.icono, fase: item.fase, backendListo: item.backendListo },
}));

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./features/autenticacion/login/login').then((m) => m.Login),
  },
  {
    path: 'cambiar-contrasena',
    title: 'Cambiar contraseña',
    canActivate: [sesionIniciadaGuard],
    loadComponent: () =>
      import('./features/autenticacion/cambiar-contrasena/cambiar-contrasena').then((m) => m.CambiarContrasena),
  },
  {
    path: '',
    canActivate: [autenticadoGuard],
    loadComponent: () => import('./core/layout/layout').then((m) => m.Layout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio',
        loadComponent: () => import('./features/inicio/inicio').then((m) => m.Inicio),
      },
      ...rutasDeModulos,
      {
        path: 'acceso-denegado',
        title: 'Acceso denegado',
        loadComponent: () => import('./shared/paginas/acceso-denegado').then((m) => m.AccesoDenegado),
      },
      {
        path: '**',
        title: 'Página no encontrada',
        loadComponent: () => import('./shared/paginas/no-encontrada').then((m) => m.NoEncontrada),
      },
    ],
  },
];
