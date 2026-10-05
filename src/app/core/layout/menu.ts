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
  /** Fase del plan de trabajo en la que se construye la pantalla. */
  fase: number;
  /** true si el backend ya expone la API de este módulo (según el contrato vigente). */
  backendListo: boolean;
}

const AMBOS: Rol[] = ['Administrador', 'Recepcionista'];
const SOLO_ADMIN: Rol[] = ['Administrador'];

/**
 * Menú de la aplicación y fuente única de los módulos.
 * Recepcionista: sin reportes, configuración, usuarios ni comisiones (regla del negocio).
 * Caja, ventas y facturación son parte de la operación diaria para ambos roles.
 */
export const ITEMS_MENU: readonly ItemMenu[] = [
  { ruta: 'inicio', titulo: 'Inicio', icono: 'inicio', descripcion: 'Resumen y accesos rápidos', roles: AMBOS, grupo: null, fase: 0, backendListo: true },

  { ruta: 'ventas', titulo: 'Ventas', icono: 'bolsa', descripcion: 'Registrar y consultar ventas', roles: AMBOS, grupo: 'Operación', fase: 5, backendListo: true },
  { ruta: 'citas', titulo: 'Citas', icono: 'calendario', descripcion: 'Agenda diaria, semanal y mensual', roles: AMBOS, grupo: 'Operación', fase: 4, backendListo: true },
  { ruta: 'clientes', titulo: 'Clientes', icono: 'usuarios', descripcion: 'Clientes e historial', roles: AMBOS, grupo: 'Operación', fase: 2, backendListo: true },
  { ruta: 'facturacion', titulo: 'Facturación', icono: 'recibo', descripcion: 'Facturas y comprobantes en PDF', roles: AMBOS, grupo: 'Operación', fase: 5, backendListo: true },
  { ruta: 'caja', titulo: 'Caja', icono: 'cartera', descripcion: 'Apertura, movimientos y arqueo', roles: AMBOS, grupo: 'Operación', fase: 5, backendListo: true },

  { ruta: 'servicios', titulo: 'Servicios', icono: 'destellos', descripcion: 'Catálogo de servicios', roles: AMBOS, grupo: 'Gestión', fase: 2, backendListo: true },
  { ruta: 'inventario', titulo: 'Inventario', icono: 'caja', descripcion: 'Productos, insumos y existencias', roles: SOLO_ADMIN, grupo: 'Gestión', fase: 3, backendListo: true },
  { ruta: 'compras', titulo: 'Compras', icono: 'camion', descripcion: 'Compras a proveedores', roles: SOLO_ADMIN, grupo: 'Gestión', fase: 3, backendListo: true },
  { ruta: 'proveedores', titulo: 'Proveedores', icono: 'edificio', descripcion: 'Directorio de proveedores', roles: SOLO_ADMIN, grupo: 'Gestión', fase: 3, backendListo: true },
  { ruta: 'empleados', titulo: 'Empleados', icono: 'credencial', descripcion: 'Equipo y horarios', roles: SOLO_ADMIN, grupo: 'Gestión', fase: 2, backendListo: true },

  { ruta: 'comisiones', titulo: 'Comisiones', icono: 'porcentaje', descripcion: 'Comisiones de los empleados', roles: SOLO_ADMIN, grupo: 'Administración', fase: 6, backendListo: true },
  { ruta: 'reportes', titulo: 'Reportes', icono: 'grafica', descripcion: 'Análisis y exportación', roles: SOLO_ADMIN, grupo: 'Administración', fase: 7, backendListo: true },
  { ruta: 'usuarios', titulo: 'Usuarios', icono: 'escudo', descripcion: 'Cuentas de acceso', roles: SOLO_ADMIN, grupo: 'Administración', fase: 1, backendListo: true },
  { ruta: 'configuracion', titulo: 'Configuración', icono: 'ajustes', descripcion: 'Negocio, impuestos y pagos', roles: SOLO_ADMIN, grupo: 'Administración', fase: 1, backendListo: true },
];

export function itemsParaRoles(roles: readonly string[]): ItemMenu[] {
  return ITEMS_MENU.filter((item) => item.roles.some((r) => roles.includes(r)));
}
