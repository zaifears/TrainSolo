import { describe, it, expect } from 'vitest';
import { TicketValidations } from '../src/app/modules/ticket/ticket.validation';
import { DateTime } from 'luxon';

describe('Ticket Validation Tests', () => {
    it('should validate station names with apostrophes (e.g. Cox\'s Bazar)', () => {
        const today = DateTime.now().setZone('Asia/Dhaka').toFormat('yyyy-MM-dd');
        const result = TicketValidations.searchTickets.safeParse({
            from: 'Dhaka',
            to: "Cox's Bazar",
            date: today,
        });

        expect(result.success).toBe(true);
    });

    it('should validate station names with underscores (e.g. Biman_Bandar, Amnura_Bypass)', () => {
        const today = DateTime.now().setZone('Asia/Dhaka').toFormat('yyyy-MM-dd');
        const result = TicketValidations.searchTickets.safeParse({
            from: 'Biman_Bandar',
            to: 'Chattogram',
            date: today,
        });

        expect(result.success).toBe(true);
    });

    it('should reject invalid station names with dangerous characters', () => {
        const today = DateTime.now().setZone('Asia/Dhaka').toFormat('yyyy-MM-dd');
        const result = TicketValidations.searchTickets.safeParse({
            from: 'Dhaka<script>',
            to: 'Chattogram',
            date: today,
        });

        expect(result.success).toBe(false);
    });

    it('should reject station names that are too short', () => {
        const today = DateTime.now().setZone('Asia/Dhaka').toFormat('yyyy-MM-dd');
        const result = TicketValidations.searchTickets.safeParse({
            from: 'D',
            to: 'Chattogram',
            date: today,
        });

        expect(result.success).toBe(false);
    });

    it('should accept dates within 10 days in Asia/Dhaka timezone', () => {
        const day5 = DateTime.now().setZone('Asia/Dhaka').plus({ days: 5 }).toFormat('yyyy-MM-dd');
        const result = TicketValidations.searchTickets.safeParse({
            from: 'Dhaka',
            to: 'Sylhet',
            date: day5,
        });

        expect(result.success).toBe(true);
    });

    it('should reject past dates', () => {
        const yesterday = DateTime.now().setZone('Asia/Dhaka').minus({ days: 1 }).toFormat('yyyy-MM-dd');
        const result = TicketValidations.searchTickets.safeParse({
            from: 'Dhaka',
            to: 'Sylhet',
            date: yesterday,
        });

        expect(result.success).toBe(false);
    });

    it('should reject dates more than 10 days in the future', () => {
        const farFuture = DateTime.now().setZone('Asia/Dhaka').plus({ days: 12 }).toFormat('yyyy-MM-dd');
        const result = TicketValidations.searchTickets.safeParse({
            from: 'Dhaka',
            to: 'Sylhet',
            date: farFuture,
        });

        expect(result.success).toBe(false);
    });
});
