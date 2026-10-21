import { Rol } from '../auth/modelos';

export type GrupoMenu = 'Operación' | 'Gestión' | 'Administración';

export interface ItemMenu {
  /** Ruta relativa dentro de la aplicación. */
  ruta: string;
  titulo: string;
  icono: string;
  descripcion: string;
  roles: Rol[];
  grupo: GrupoMenu | null;
}

const AMBOS: Rol[] = ['Administrador', 'Recepcionista'];
const SOLO_ADMIN: Rol[] = ['Administrador'];

/**
 * Menú de la aplicación y fuente única de los módulos.
 * Recepcionista: sin reportes, configuración, usuarios ni comisiones, y sin los módulos de gestión que el backend reserva al Administrador.
 */
export const ITEMS_MENU: readonly ItemMenu[] = [
  { ruta: 'inicio', titulo: 'Inicio', icono: 'inicio', descripcion: 'Resumen y accesos rápidos', roles: AMBOS, grupo: null },

  { ruta: 'ventas', titulo: 'Ventas', icono: 'bolsa', descripcion: 'Registrar y consultar ventas', roles: AMBOS, grupo: 'Operación' },
  { ruta: 'citas', titulo: 'Citas', icono: 'calendario', descripcion: 'Agenda diaria y semanal', roles: AMBOS, grupo: 'Operación' },
  { ruta: 'clientes', titulo: 'Clientes', icono: 'usuarios', descripcion: 'Clientes e historial', roles: AMBOS, grupo: 'Operación' },
  { ruta: 'facturacion', titulo: 'Facturación', icono: 'recibo', descripcion: 'Facturas y comprobantes en PDF', roles: AMBOS, grupo: 'Operación' },
  { ruta: 'caja', titulo: 'Caja', icono: 'cartera', descripcion: 'Apertura, movimientos y arqueo', roles: AMBOS, grupo: 'Operación' },
  { ruta: 'finanzas', titulo: 'Finanzas', icono: 'cartera', descripcion: 'Cuentas, movimientos y métodos de pago', roles: AMBOS, grupo: 'Operación' },

  { ruta: 'servicios', titulo: 'Servicios', icono: 'destellos', descripcion: 'Catálogo de servicios', roles: AMBOS, grupo: 'Gestión' },
  { ruta: 'inventario', titulo: 'Inventario', icono: 'caja', descripcion: 'Productos, insumos y existencias', roles: SOLO_ADMIN, grupo: 'Gestión' },
  { ruta: 'compras', titulo: 'Compras', icono: 'camion', descripcion: 'Compras a proveedores', roles: SOLO_ADMIN, grupo: 'Gestión' },
  { ruta: 'proveedores', titulo: 'Proveedores', icono: 'edificio', descripcion: 'Directorio de proveedores', roles: SOLO_ADMIN, grupo: 'Gestión' },
  { ruta: 'empleados', titulo: 'Empleados', icono: 'credencial', descripcion: 'Equipo y horarios', roles: SOLO_ADMIN, grupo: 'Gestión' },

  { ruta: 'comisiones', titulo: 'Comisiones', icono: 'porcentaje', descripcion: 'Comisiones de los empleados', roles: SOLO_ADMIN, grupo: 'Administración' },
  { ruta: 'reportes', titulo: 'Reportes', icono: 'grafica', descripcion: 'Análisis y exportación', roles: SOLO_ADMIN, grupo: 'Administración' },
  { ruta: 'usuarios', titulo: 'Usuarios', icono: 'escudo', descripcion: 'Cuentas de acceso', roles: SOLO_ADMIN, grupo: 'Administración' },
  { ruta: 'configuracion', titulo: 'Configuración', icono: 'ajustes', descripcion: 'Negocio, impuestos y numeración', roles: SOLO_ADMIN, grupo: 'Administración' },
];

export function itemsParaRoles(roles: readonly string[]): ItemMenu[] {
  return ITEMS_MENU.filter((item) => item.roles.some((r) => roles.includes(r)));
}
