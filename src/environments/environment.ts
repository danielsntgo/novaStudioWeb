// Entorno de producción. Reemplaza apiUrl por la URL pública de la API
// (debe compartir dominio con el frontend, por ejemplo app.midominio.com y api.midominio.com,
// para que la cookie del refresh token funcione).
export const environment = {
  produccion: true,
  apiUrl: 'https://api.midominio.com',
};
