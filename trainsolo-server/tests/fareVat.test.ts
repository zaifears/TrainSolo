import { describe, it, expect } from 'vitest';

describe('Fare & VAT Calculation Tests', () => {
    const vatClasses = [
        'AC_B',
        'AC_S',
        'SNIGDHA',
        'F_BERTH',
        'F_SEAT',
        'F_CHAIR',
        'AC_CHAIR',
    ];

    const calculateFare = (baseFare: number, seatClass: string) => {
        return vatClasses.includes(seatClass)
            ? Math.round(baseFare + baseFare * 0.15)
            : baseFare;
    };

    it('should apply 15% VAT rounded to AC and First class tickets', () => {
        expect(calculateFare(1000, 'AC_S')).toBe(1150);
        expect(calculateFare(1000, 'SNIGDHA')).toBe(1150);
        expect(calculateFare(850, 'AC_CHAIR')).toBe(978);
    });

    it('should NOT apply VAT to standard chair tickets', () => {
        expect(calculateFare(400, 'S_CHAIR')).toBe(400);
        expect(calculateFare(250, 'SHOVAN')).toBe(250);
    });
});
