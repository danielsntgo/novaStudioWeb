import { normalizarPagina, numero, parametros } from './paginas';

describe('paginas', () => {
  it('unifica total y totalElementos', () => {
    expect(normalizarPagina({ elementos: [1, 2], pagina: 2, tamanoPagina: 2, total: 9 }).total).toBe(9);
    expect(normalizarPagina({ elementos: [1], pagina: 1, tamanoPagina: 20, totalElementos: 5 }).total).toBe(5);
  });

  it('acepta una lista simple como respuesta', () => {
    const p = normalizarPagina<number>([1, 2, 3]);
    expect(p.elementos).toEqual([1, 2, 3]);
    expect(p.total).toBe(3);
  });

  it('tolera respuestas vacías o raras', () => {
    expect(normalizarPagina(null).elementos).toEqual([]);
    expect(normalizarPagina({}).total).toBe(0);
  });

  it('parametros omite valores vacíos y conserva los false', () => {
    const p = parametros({ buscar: '', activo: false, pagina: 1, x: null, y: undefined });
    expect(p.keys().sort()).toEqual(['activo', 'pagina']);
    expect(p.get('activo')).toBe('false');
  });

  it('numero convierte texto y protege de NaN', () => {
    expect(numero('12.5')).toBe(12.5);
    expect(numero('abc')).toBe(0);
    expect(numero(null)).toBe(0);
  });
});
