import { HttpErrorResponse } from '@angular/common/http';
import { leerProblema, mensajeDeError } from './problema';

const error = (status: number, cuerpo: unknown) => new HttpErrorResponse({ status, error: cuerpo });

describe('problema', () => {
  it('extrae el código de negocio y el título en español', () => {
    const p = leerProblema(error(409, { type: 'urn:flexpos:error:cita.solapamiento', title: 'El empleado ya tiene una cita.', status: 409 }));
    expect(p.estado).toBe(409);
    expect(p.codigo).toBe('cita.solapamiento');
    expect(p.titulo).toBe('El empleado ya tiene una cita.');
  });

  it('oculta los detalles de los errores 5xx', () => {
    const p = leerProblema(error(500, { title: 'NullReferenceException en Foo.Bar' }));
    expect(p.titulo).not.toContain('NullReference');
  });

  it('devuelve el primer error de campo de un 400', () => {
    const e = error(400, { title: 'Validación', errors: { Nombre: ['El nombre es obligatorio.'] } });
    expect(leerProblema(e).errores).toEqual({ Nombre: ['El nombre es obligatorio.'] });
    expect(mensajeDeError(e)).toBe('El nombre es obligatorio.');
  });

  it('sin respuesta del servidor (estado 0) da un mensaje de conexión', () => {
    expect(leerProblema(error(0, null)).titulo).toContain('conectar');
  });

  it('un error que no es HTTP no rompe', () => {
    expect(mensajeDeError(new Error('x'))).toBeTruthy();
  });
});
