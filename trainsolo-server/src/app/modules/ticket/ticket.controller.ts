import status from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { TicketServices } from './ticket.service';
import getTokenFromTokenBearer from '../../routes/getTokenFromTokenBearer';

const searchTickets = catchAsync(async (req, res) => {
    const token = getTokenFromTokenBearer(req.headers.authorization);
    const ssdk = req.headers['x-device-key'] as string | undefined;
    const uudid = req.headers['x-device-id'] as string | undefined;
    const xRequestedWith = req.headers['x-requested-with'] as
        | string
        | undefined;
    const result = await TicketServices.searchTickets(
        req.body,
        token,
        ssdk,
        uudid,
        xRequestedWith,
    );
    sendResponse(res, {
        statusCode: status.OK,
        message: 'Tickets are fetched successfully',
        data: result,
    });
});

export const TicketControllers = {
    searchTickets,
};
