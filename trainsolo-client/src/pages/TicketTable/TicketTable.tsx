import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import useTicketContext from '@/hooks/useTicketContext';
import { HiMiniSpeakerWave } from 'react-icons/hi2';
import { IoStopCircle } from 'react-icons/io5';
import { BsFillTrashFill, BsInfoCircleFill } from 'react-icons/bs';
import { MdNotifications, MdNotificationsActive } from 'react-icons/md';
import moment from 'moment-timezone';
import formatDateToStr from '@/utils/formatDateToStr';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { ITicket } from '@/types/ticket.type';
import { ImSpinner9 } from 'react-icons/im';
import audio from '@/assets/audio/notification.mp3';
import toast from 'react-hot-toast';
import newTicketToast from '@/utils/newTicketToast';
import { useNavigate } from 'react-router';
import axiosInstance from '@/helpers/axiosInstance';
import addNotification from 'react-push-notification';

const SCAN_INTERVAL_SECONDS = 15;

const TicketTable = () => {
    const { scans } = useTicketContext();
    const [ticketsObj, setTicketsObj] = useState<Record<string, ITicket[]>>({});
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [countdown, setCountdown] = useState(SCAN_INTERVAL_SECONDS);
    const [scanCount, setScanCount] = useState(0);
    const [lastScanTime, setLastScanTime] = useState<string | null>(null);
    const [lastErrorMsg, setLastErrorMsg] = useState<string | null>(null);
    const [notificationsEnabled, setNotificationsEnabled] = useState(
        Notification.permission === 'granted',
    );

    const notificationAudio = useRef(new Audio(audio));
    const navigate = useNavigate();
    const ticketsObjRef = useRef(ticketsObj);
    ticketsObjRef.current = ticketsObj;

    // Redirect to setup if no scans configured
    useEffect(() => {
        if (!scans || !scans.length) {
            navigate('/');
        }
    }, [scans, navigate]);

    // Core ticket scanning function
    const fetchAllTickets = useCallback(async () => {
        if (!scans || !scans.length) return;

        setIsFetching(true);
        setLastErrorMsg(null);

        try {
            await Promise.all(
                scans.map(async (scan) => {
                    if (!scan.from || !scan.to || !scan.date) return;
                    const formatDate = formatDateToStr(scan.date);
                    const key = `${scan.from}-${scan.to}-${formatDate}`;

                    try {
                        const res = await axiosInstance.post('/tickets', {
                            from: scan.from,
                            to: scan.to,
                            date: formatDate,
                        });

                        const newTickets = (res.data.data || []) as ITicket[];
                        const currentOldTickets = [
                            ...(ticketsObjRef.current[key] || []),
                        ];

                        newTickets.forEach((newTicket) => {
                            const matchOldTicket = currentOldTickets.find(
                                (old) =>
                                    old.trainName === newTicket.trainName &&
                                    old.class === newTicket.class,
                            );

                            if (
                                matchOldTicket &&
                                newTicket.seats > matchOldTicket.seats
                            ) {
                                notificationAudio.current.play();
                                newTicketToast(newTicket);
                            }
                            if (!matchOldTicket) {
                                currentOldTickets.push(newTicket);
                                notificationAudio.current.play();
                                newTicketToast(newTicket);
                            }
                        });

                        currentOldTickets.forEach((oldTicket) => {
                            const newTicketMatch = newTickets.find(
                                (newTicket) =>
                                    oldTicket.trainName ===
                                        newTicket.trainName &&
                                    oldTicket.class === newTicket.class,
                            );

                            if (newTicketMatch) {
                                oldTicket.seats = newTicketMatch.seats;
                                oldTicket.now = newTicketMatch.now;
                            } else {
                                oldTicket.seats = 0;
                            }
                        });

                        setTicketsObj((prev) => ({
                            ...prev,
                            [key]: currentOldTickets,
                        }));
                    } catch (err: unknown) {
                        const message =
                            err &&
                            typeof err === 'object' &&
                            'response' in err &&
                            (err as { response?: { data?: { message?: string } } })
                                .response?.data?.message
                                ? (err as { response: { data: { message: string } } })
                                      .response.data.message
                                : 'Shohoz server busy (retrying...)';
                        setLastErrorMsg(message);
                        // Crucial: Do NOT navigate away on error! Keep scanning.
                    }
                }),
            );
        } finally {
            setIsInitialLoading(false);
            setIsFetching(false);
            setScanCount((prev) => prev + 1);
            setLastScanTime(moment().format('hh:mm:ss A'));
            setCountdown(SCAN_INTERVAL_SECONDS);
        }
    }, [scans]);

    // Initial immediate fetch on mount
    useEffect(() => {
        fetchAllTickets();
    }, [fetchAllTickets]);

    // Automatic countdown & polling interval
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    fetchAllTickets();
                    return SCAN_INTERVAL_SECONDS;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [fetchAllTickets]);

    const handleManualScan = () => {
        setCountdown(SCAN_INTERVAL_SECONDS);
        fetchAllTickets();
    };

    const handleStop = () => {
        navigate('/');
    };

    const handleTestNotificationAudio = () => {
        notificationAudio.current.play();
        if (notificationsEnabled) {
            addNotification({
                title: 'TrainSolo Alert Test',
                message: 'Audio and desktop notification are working perfectly!',
                theme: 'darkblue',
                duration: 8000,
                native: true,
                icon: '/favicon.ico',
                vibrate: [200, 100, 200],
                onClick: () => {
                    window.focus();
                },
            });
        }
    };

    const handleEnableNotification = async () => {
        if (!('Notification' in window)) {
            toast.error('This browser does not support notifications');
            return;
        }

        if (Notification.permission === 'denied') {
            toast.error(
                'Notifications are blocked. Please enable them in your browser settings.',
            );
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                setNotificationsEnabled(true);
                toast.success('Push notifications enabled!');
            } else {
                toast.error('Notification permission was not granted.');
            }
        } catch {
            toast.error('Failed to request notification permission');
        }
    };

    const handleClear = () => {
        const filteredTicketsObj: Record<string, ITicket[]> = {};
        const allTickets = Object.values(ticketsObj).flat();
        const findUnavailable = allTickets.find((t) => t.seats === 0);

        if (!findUnavailable) {
            toast('No unavailable tickets found', {
                icon: <BsInfoCircleFill size={18} className="text-[#3498db]" />,
            });
            return;
        }

        Object.entries(ticketsObj).forEach(([key, tickets]) => {
            filteredTicketsObj[key] = tickets.filter((ticket) => ticket.seats);
        });

        toast.success('Unavailable tickets removed');
        setTicketsObj(filteredTicketsObj);
    };

    const ticketsArray: ITicket[] = Object.values(ticketsObj).flat();
    const activeRoute = scans[0]
        ? `${scans[0].from} ➔ ${scans[0].to} (${scans[0].date ? formatDateToStr(scans[0].date) : ''})`
        : 'Active Journey';

    return (
        <div className="min-h-[90dvh] max-w-5xl mx-auto space-y-4">
            {/* Header Status Bar */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-sm" />
                    <div>
                        <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            TrainSolo Live Scanner
                            {isFetching && (
                                <ImSpinner9 className="animate-spin text-emerald-600 text-sm" />
                            )}
                        </h2>
                        <p className="text-xs text-gray-500">
                            Route: <span className="font-semibold text-gray-700">{activeRoute}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                    <span>
                        Next scan in: <strong className="text-emerald-700">{countdown}s</strong>
                    </span>
                    <span>•</span>
                    <span>Pings: {scanCount}</span>
                    {lastScanTime && (
                        <>
                            <span>•</span>
                            <span className="text-gray-400">Last: {lastScanTime}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap gap-2.5 justify-center">
                <Button
                    size="sm"
                    className="bg-[#1ca559] hover:bg-[#167457] text-white cursor-pointer font-semibold shadow-sm"
                    onClick={handleManualScan}
                    disabled={isFetching}
                >
                    {isFetching ? (
                        <>
                            <ImSpinner9 className="animate-spin mr-1" /> Scanning...
                        </>
                    ) : (
                        '⚡ Scan Now'
                    )}
                </Button>

                <Button
                    size="sm"
                    className="bg-[#df3c4f] hover:bg-red-700 text-white cursor-pointer"
                    onClick={handleStop}
                >
                    <IoStopCircle className="mr-1" />
                    Stop Scanner
                </Button>

                <Button
                    size="sm"
                    className="bg-[#2f6493] hover:bg-[#314c63] text-white cursor-pointer"
                    onClick={handleTestNotificationAudio}
                >
                    {notificationsEnabled ? (
                        <>
                            <MdNotificationsActive className="mr-1" />
                            Test Chime & Alert
                        </>
                    ) : (
                        <>
                            <HiMiniSpeakerWave className="mr-1" />
                            Test Chime
                        </>
                    )}
                </Button>

                {!notificationsEnabled && (
                    <Button
                        size="sm"
                        className="bg-[#892bb1] hover:bg-[#722294] text-white cursor-pointer"
                        onClick={handleEnableNotification}
                    >
                        <MdNotifications className="mr-1" />
                        Enable Push Alerts
                    </Button>
                )}

                <Button
                    size="sm"
                    className="bg-gray-600 hover:bg-gray-700 text-white cursor-pointer"
                    onClick={handleClear}
                >
                    <BsFillTrashFill className="mr-1" /> Clear 0-Seat Rows
                </Button>
            </div>

            {/* Error Banner if Shohoz has temporary glitch */}
            {lastErrorMsg && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2.5 rounded-xl text-center">
                    ⚠️ {lastErrorMsg} — Scanner is staying active and will retry in {countdown}s.
                </div>
            )}

            {/* Results or Pre-Drop Standby Card */}
            {isInitialLoading ? (
                <div className="bg-white p-8 rounded-2xl text-center shadow-sm border border-gray-100 max-w-lg mx-auto">
                    <ImSpinner9 className="animate-spin text-3xl text-emerald-600 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-gray-800">
                        Connecting to Bangladesh Railway...
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                        Performing initial inventory scan for {activeRoute}
                    </p>
                </div>
            ) : ticketsArray.length ? (
                <div className="bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="text-sm">
                                <TableHead>From</TableHead>
                                <TableHead>To</TableHead>
                                <TableHead>Departure</TableHead>
                                <TableHead>Train Name</TableHead>
                                <TableHead>Class</TableHead>
                                <TableHead>Seats</TableHead>
                                <TableHead>Fare</TableHead>
                                <TableHead>Found At</TableHead>
                                <TableHead className="w-[1%] text-right">
                                    Instant Booking
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ticketsArray.map((ticket, index) => (
                                <TableRow key={index} className="h-11">
                                    <TableCell className="font-medium">{ticket.from}</TableCell>
                                    <TableCell>{ticket.to}</TableCell>
                                    <TableCell>{ticket.departureDateTime}</TableCell>
                                    <TableCell className="font-semibold text-gray-900">
                                        {ticket.trainName}
                                    </TableCell>
                                    <TableCell>
                                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                                            {ticket.class}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`font-bold ${
                                                ticket.seats > 0
                                                    ? 'text-emerald-600'
                                                    : 'text-gray-400'
                                            }`}
                                        >
                                            {ticket.seats}
                                        </span>
                                    </TableCell>
                                    <TableCell>৳ {ticket.fare}</TableCell>
                                    <TableCell className="text-xs text-gray-500">
                                        {moment(ticket.now).format('h:mm:ss a')}
                                    </TableCell>
                                    <TableCell className="w-[1%] text-right">
                                        {ticket.seats ? (
                                            <a
                                                href={`${ticket.link}#autocut=1`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <Button
                                                    size="sm"
                                                    className="cursor-pointer bg-[#16a34a] hover:bg-[#15803d] text-white font-semibold flex items-center gap-1 shadow-sm whitespace-nowrap"
                                                >
                                                    ⚡ Auto-Cut & OTP
                                                </Button>
                                            </a>
                                        ) : (
                                            <span className="text-xs text-gray-400">Sold out</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                /* Pre-Drop Standby Card (Active when 0 trains / 0 seats before 8:00 AM) */
                <div className="bg-white p-8 rounded-2xl max-w-xl mx-auto text-center shadow-sm border border-blue-100 space-y-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full text-2xl animate-pulse">
                        🕒
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">
                            Pre-Drop Standby Mode Active
                        </h3>
                        <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                            No trains or seats released yet by Bangladesh Railway for this journey date.
                            TrainSolo is actively monitoring Shohoz servers every{' '}
                            <strong>{SCAN_INTERVAL_SECONDS}s</strong>.
                        </p>
                        <p className="text-xs text-emerald-700 font-semibold mt-1">
                            The moment tickets unlock at 7:58 - 8:00 AM, the audio chime will ring and tickets will appear here instantly!
                        </p>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Button
                            onClick={handleManualScan}
                            size="sm"
                            className="bg-[#1ca559] hover:bg-[#167457] text-white font-semibold px-4 cursor-pointer"
                            disabled={isFetching}
                        >
                            {isFetching ? 'Checking now...' : '⚡ Scan Now (Instant Check)'}
                        </Button>
                        <span className="text-xs text-gray-400">
                            Auto-checking in {countdown}s
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TicketTable;
