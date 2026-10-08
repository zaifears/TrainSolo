/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    IShohozApiResponse,
    TMyResponse,
    TSearchTicketPayload,
} from './ticket.interface';
import ApiError from '../../errors/ApiError';
import status from 'http-status';
import formatDateShohoz from '../../utils/formatDateShohoz';
import formatStationNameShohoz from '../../utils/formatStationNameShohoz';
import axiosInstance from '../../helpers/axiosInstance';

const searchTickets = async (
    payload: TSearchTicketPayload,
    token: string | undefined,
    ssdk: string | undefined,
    uudid: string | undefined,
    xRequestedWith: string | undefined,
) => {
    if (!token || !ssdk || !uudid || !xRequestedWith) {
        throw new ApiError(status.UNAUTHORIZED, 'Unauthorized access');
    }

    const fromCity = formatStationNameShohoz(payload.from);
    const toCity = formatStationNameShohoz(payload.to);
    const date = formatDateShohoz(payload.date);

    const shohozSeatClass =
        payload.seatClass && payload.seatClass !== 'ANY'
            ? payload.seatClass
            : 'S_CHAIR';

    let axiosResponse;
    try {
        axiosResponse = await axiosInstance.get(
            `/bookings/search-trips-v2?from_city=${fromCity}&to_city=${toCity}&date_of_journey=${date}&seat_class=${shohozSeatClass}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'x-device-key': ssdk,
                    'x-device-id': uudid,
                    'x-requested-with': xRequestedWith,
                },
            },
        );
    } catch (err: any) {
        const statusCode =
            err.response?.status ||
            err.statusCode ||
            status.INTERNAL_SERVER_ERROR;
        const message =
            err.response?.data?.message ||
            err.message ||
            'Error communicating with Shohoz';
        throw new ApiError(statusCode, message);
    }

    const shohozApiResponse = axiosResponse.data as IShohozApiResponse;

    if (!shohozApiResponse || typeof shohozApiResponse !== 'object') {
        throw new ApiError(status.BAD_GATEWAY, 'Malformed response from Shohoz upstream API');
    }

    if (shohozApiResponse.data === undefined) {
        const errorMsg =
            (shohozApiResponse as unknown as Record<string, unknown>).message ||
            'Upstream Shohoz returned an unexpected response structure without data';
        throw new ApiError(status.BAD_GATEWAY, String(errorMsg));
    }

    // During pre-drop standby (e.g. before 8:00 AM), trains array may be empty.
    // Return empty array so the client continues actively polling without aborting.
    if (!Array.isArray(shohozApiResponse.data?.trains) || shohozApiResponse.data.trains.length === 0) {
        return [];
    }

    const minSeatsNeeded = payload.seatCount || 1;

    const result = shohozApiResponse.data.trains.reduce(
        (acc: TMyResponse, curr) => {
            const trainName = curr.trip_number;
            const departureDateTime = curr.departure_date_time;
            const arrivalDateTime = curr.arrival_date_time;
            const travelTime = curr.travel_time;
            const from = payload.from;
            const to = payload.to;

            // Optional preferred train filter
            if (
                payload.preferredTrain &&
                !trainName
                    .toUpperCase()
                    .includes(payload.preferredTrain.toUpperCase())
            ) {
                return acc;
            }

            curr.seat_types.forEach((seat) => {
                const seatClass = seat.type;

                // Strict class filtering if user selected a specific seat type
                if (
                    payload.seatClass &&
                    payload.seatClass !== 'ANY' &&
                    seatClass !== payload.seatClass
                ) {
                    return;
                }

                // Web booking quota strictly comes from online inventory
                const onlineSeats =
                    typeof seat.seat_counts?.online === 'number'
                        ? seat.seat_counts.online
                        : Number(seat.seat_counts || 0);

                const baseFare = Number(seat.fare || 0);
                const vatClasses = [
                    'AC_B',
                    'AC_S',
                    'SNIGDHA',
                    'F_BERTH',
                    'F_SEAT',
                    'F_CHAIR',
                    'AC_CHAIR',
                ];
                const finalFare = vatClasses.includes(seatClass)
                    ? Math.round(baseFare + baseFare * 0.15)
                    : baseFare;
                const trainNumberMatch = curr.trip_number.match(/\b\d{3,4}\b/);
                const trainNumber = trainNumberMatch ? trainNumberMatch[0] : '';
                const link = `https://eticket.railway.gov.bd/booking/train/search?fromcity=${fromCity}&tocity=${toCity}&doj=${date}&class=${seatClass}&train=${encodeURIComponent(trainName)}&train_number=${encodeURIComponent(trainNumber)}&seats=${minSeatsNeeded}`;

                acc.push({
                    trainName,
                    trainNumber,
                    departureDateTime,
                    arrivalDateTime,
                    travelTime,
                    from,
                    to,
                    class: seatClass,
                    fare: finalFare,
                    seats: onlineSeats,
                    now: new Date(),
                    link,
                });
            });

            return acc;
        },
        [],
    );

    return result;
};

export const TicketServices = {
    searchTickets,
};
