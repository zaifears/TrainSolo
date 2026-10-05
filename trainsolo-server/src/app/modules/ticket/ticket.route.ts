import express from 'express';
import validateRequest from '../../middlewares/validateRequest';
import { ticketRateLimiter } from '../../middlewares/rateLimiter';
import { TicketValidations } from './ticket.validation';
import { TicketControllers } from './ticket.controller';

const router = express.Router();

router.post(
    '/',
    ticketRateLimiter,
    validateRequest(TicketValidations.searchTickets),
    TicketControllers.searchTickets,
);

export const TicketRoutes = router;
