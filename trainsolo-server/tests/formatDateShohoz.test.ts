import { describe, it, expect } from 'vitest';
import formatDateShohoz from '../src/app/utils/formatDateShohoz';

describe('formatDateShohoz Tests', () => {
    it('should format ISO YYYY-MM-DD into DD-MMM-YYYY accurately', () => {
        expect(formatDateShohoz('2026-10-11')).toBe('11-Oct-2026');
        expect(formatDateShohoz('2026-06-09')).toBe('09-Jun-2026');
        expect(formatDateShohoz('2026-01-01')).toBe('01-Jan-2026');
        expect(formatDateShohoz('2026-12-31')).toBe('31-Dec-2026');
    });

    it('should pad single-digit day strings with leading zero', () => {
        expect(formatDateShohoz('2026-05-04')).toBe('04-May-2026');
        expect(formatDateShohoz('2026-03-08')).toBe('08-Mar-2026');
    });
});
