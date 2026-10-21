import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { SILENCIAR_ERRORES } from './contextos';

/** Cuando se pide un archivo (blob) y falla, el cuerpo del error también llega como blob: se convierte a JSON. */
function convertirError(err: unknown): Observable<never> {
  if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
    return from(err.error.text()).pipe(
      map((texto) => {
        try {
          return JSON.parse(texto) as unknown;
        } catch {
          return null;
        }
      }),
      switchMap((cuerpo) => throwError(() => new HttpErrorResponse({ status: err.status, statusText: err.statusText, url: err.url ?? undefined, error: cuerpo }))),
    );
  }
  return throwError(() => err);
}

function nombreDeArchivo(cabecera: string | null, porDefecto: string): string {
  if (!cabecera) return porDefecto;
  const coincidencia = /filename\*=(?:UTF-8'')?([^;]+)|filename="?([^";]+)"?/i.exec(cabecera);
  const bruto = coincidencia?.[1] ?? coincidencia?.[2];
  if (!bruto) return porDefecto;
  try {
    return decodeURIComponent(bruto.trim().replace(/^"|"$/g, ''));
  } catch {
    return bruto.trim();
  }
}

/** Descarga un archivo de la API (con la sesión activa) y lo guarda en el equipo del usuario. */
export function descargarArchivo(http: HttpClient, url: string, nombrePorDefecto: string, params?: HttpParams): Observable<void> {
  return http
    .get(url, {
      params,
      observe: 'response',
      responseType: 'blob',
      context: new HttpContext().set(SILENCIAR_ERRORES, true),
    })
    .pipe(
      catchError(convertirError),
      map((respuesta) => {
        const archivo = respuesta.body;
        if (!archivo) throw new Error('El servidor no devolvió ningún archivo.');
        const enlace = document.createElement('a');
        const direccion = URL.createObjectURL(archivo);
        enlace.href = direccion;
        enlace.download = nombreDeArchivo(respuesta.headers.get('Content-Disposition'), nombrePorDefecto);
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(direccion), 10_000);
      }),
    );
}
