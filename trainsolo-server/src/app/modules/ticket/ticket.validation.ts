import { DateTime } from 'luxon';
import { z } from 'zod';

const stationNameSchema = z
    .string({ required_error: 'Station name is required' })
    .trim()
    .min(2, 'Station name must be at least 2 characters')
    .max(60, 'Station name must not exceed 60 characters')
    .regex(
        /^[A-Za-z0-9\s\-_'().]+$/,
        'Station name may only contain alphanumeric characters, spaces, hyphens, underscores, apostrophes, and parentheses',
    );

const searchTickets = z.object({
    from: stationNameSchema,
    to: stationNameSchema,
    date: z
        .string({ required_error: 'Journey date is required' })
        .date('Date must be formatted as YYYY-MM-DD')
        .refine(
            (value) => {
                const date = DateTime.fromISO(value, {
                    zone: 'Asia/Dhaka',
                }).startOf('day');
                const today = DateTime.now()
                    .setZone('Asia/Dhaka')
                    .startOf('day');
                const maxDate = today.plus({ days: 10 });

                return date >= today && date <= maxDate;
            },
            {
                message:
                    'Date must be between today and 10 days from now (Asia/Dhaka timezone)',
            },
        ),
    seatClass: z.string().trim().optional(),
    seatCount: z.number().int().min(1).max(4).optional(),
    preferredTrain: z.string().trim().optional(),
});

export const TicketValidations = {
    searchTickets,
};
