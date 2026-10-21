import { Route, Routes } from '@angular/router';
import { autenticadoGuard, invitadoGuard, rolGuard, sesionIniciadaGuard } from './core/auth/guards';
import { ITEMS_MENU, ItemMenu } from './core/layout/menu';

/** Pantalla de cada módulo, cargada solo cuando se visita (lazy loading). */
const PANTALLAS: Record<string, Route['loadComponent']> = {
  ventas: () => import('./features/ventas/ventas').then((m) => m.Ventas),
  citas: () => import('./features/citas/citas').then((m) => m.Citas),
  clientes: () => import('./features/clientes/clientes').then((m) => m.Clientes),
  facturacion: () => import('./features/facturacion/facturacion').then((m) => m.Facturacion),
  caja: () => import('./features/caja/caja').then((m) => m.CajaPagina),
  finanzas: () => import('./features/finanzas/finanzas').then((m) => m.Finanzas),
  servicios: () => import('./features/servicios/servicios').then((m) => m.Servicios),
  inventario: () => import('./features/inventario/inventario').then((m) => m.Inventario),
  compras: () => import('./features/compras/compras').then((m) => m.Compras),
  proveedores: () => import('./features/proveedores/proveedores').then((m) => m.Proveedores),
  empleados: () => import('./features/empleados/empleados').then((m) => m.Empleados),
  comisiones: () => import('./features/comisiones/comisiones').then((m) => m.Comisiones),
  reportes: () => import('./features/reportes/reportes').then((m) => m.Reportes),
  usuarios: () => import('./features/usuarios/usuarios').then((m) => m.Usuarios),
  configuracion: () => import('./features/configuracion/configuracion').then((m) => m.Configuracion),
};

function rutaDeModulo(item: ItemMenu): Route {
  return { path: item.ruta, title: item.titulo, canActivate: [rolGuard(...item.roles)], loadComponent: PANTALLAS[item.ruta] };
}

const rutasDeModulos: Routes = ITEMS_MENU.filter((item) => item.ruta !== 'inicio').map(rutaDeModulo);

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
      // La pantalla de nueva venta va antes que la ruta genérica de ventas.
      {
        path: 'ventas/nueva',
        title: 'Nueva venta',
        canActivate: [rolGuard('Administrador', 'Recepcionista')],
        loadComponent: () => import('./features/ventas/pos').then((m) => m.Pos),
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
