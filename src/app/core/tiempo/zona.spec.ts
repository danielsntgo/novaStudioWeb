import { aIsoConDesfase, etiquetaFecha, fechaLocalDe, horaDeMinutos, horaLocalDe, inicioDiaUtc, lunesDe, minutosDe, sumarDias } from './zona';

describe('zona horaria del negocio', () => {
  it('convierte un instante UTC a fecha y hora de Bogotá (UTC-5)', () => {
    expect(fechaLocalDe('2026-10-05T03:30:00Z')).toBe('2026-10-04');
    expect(horaLocalDe('2026-10-05T03:30:00Z')).toBe('22:30');
    expect(horaLocalDe('2026-10-05T05:00:00Z')).toBe('00:00');
  });

  it('arma el ISO con desfase que exige la API', () => {
    expect(aIsoConDesfase('2026-10-05', '09:00')).toBe('2026-10-05T09:00:00-05:00');
    expect(aIsoConDesfase('2026-10-05', '09:00:00')).toBe('2026-10-05T09:00:00-05:00');
  });

  it('el inicio del día local en UTC', () => {
    expect(inicioDiaUtc('2026-10-05')).toBe('2026-10-05T05:00:00.000Z');
  });

  it('suma días sin errores de mes ni de año', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('el lunes de la semana (domingo pertenece a la semana anterior)', () => {
    expect(lunesDe('2026-10-04')).toBe('2026-09-28'); // domingo
    expect(lunesDe('2026-10-05')).toBe('2026-10-05'); // lunes
    expect(lunesDe('2026-10-09')).toBe('2026-10-05'); // viernes
  });

  it('etiqueta de fecha en español', () => {
    expect(etiquetaFecha('2026-10-04')).toBe('Domingo, 4 de octubre');
  });

  it('minutos y horas son inversos', () => {
    expect(minutosDe('09:30')).toBe(570);
    expect(horaDeMinutos(570)).toBe('09:30');
  });
});
