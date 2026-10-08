export type TApiResponse = {
    success: boolean;
    message: string;
    data: ITicket[];
};

export interface ITicket {
    trainName: string;
    trainNumber?: string;
    departureDateTime: string;
    arrivalDateTime: string;
    travelTime: string;
    from: string;
    to: string;
    class: string;
    fare: number;
    seats: number;
    now: string;
    link: string;
    scanId?: string;
    requiredSeats?: number;
    journeyDate?: string;
    isStale?: boolean;
}
