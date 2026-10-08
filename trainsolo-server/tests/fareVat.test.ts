import { describe, it, expect } from 'vitest';
import { calculateFareWithVat } from '../src/app/modules/ticket/ticket.utils';

describe('Fare & VAT Calculation Tests', () => {
    it('should apply 15% VAT rounded to AC and First class tickets', () => {
        expect(calculateFareWithVat(1000, 'AC_S')).toBe(1150);
        expect(calculateFareWithVat(1000, 'SNIGDHA')).toBe(1150);
        expect(calculateFareWithVat(850, 'AC_CHAIR')).toBe(978);
    });

    it('should NOT apply VAT to standard chair tickets', () => {
        expect(calculateFareWithVat(400, 'S_CHAIR')).toBe(400);
        expect(calculateFareWithVat(250, 'SHOVAN')).toBe(250);
    });
});
