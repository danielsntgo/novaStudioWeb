// Entorno de desarrollo. apiUrl vacío: las peticiones a /api pasan por el proxy
// de `ng serve` (proxy.conf.json) hacia la API local, así frontend y API comparten origen.
export const environment = {
  produccion: false,
  apiUrl: '',
};
