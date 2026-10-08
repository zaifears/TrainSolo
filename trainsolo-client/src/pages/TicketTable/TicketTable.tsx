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
        typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted',
    );

    const notificationAudio = useRef(new Audio(audio));
    const navigate = useNavigate();
    const ticketsObjRef = useRef(ticketsObj);
    ticketsObjRef.current = ticketsObj;

    const inFlightRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const scanRequestIdRef = useRef(0);

    // Live Bangladesh Standard Time clock and 7:59:58 AM precision trigger
    const [bstClock, setBstClock] = useState('');
    const [secondsTo8Am, setSecondsTo8Am] = useState<number | null>(null);
    const [isBurstActive, setIsBurstActive] = useState(false);
    const inBurstRef = useRef(false);

    // Redirect to setup if no valid scans configured
    useEffect(() => {
        if (!scans || !scans.some((s) => s.from && s.to && s.date)) {
            navigate('/');
        }
    }, [scans, navigate]);

    // Core ticket scanning function with synchronous in-flight guard and AbortController
    const fetchAllTickets = useCallback(async () => {
        if (!scans || !scans.some((s) => s.from && s.to && s.date)) return;
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        setIsFetching(true);
        setLastErrorMsg(null);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const currentRequestId = ++scanRequestIdRef.current;

        try {
            await Promise.all(
                scans.map(async (scan) => {
                    if (!scan.from || !scan.to || !scan.date) return;
                    const formatDate = formatDateToStr(scan.date);
                    // Disambiguate cache key with class and train filter
                    const key = `${scan.from}-${scan.to}-${formatDate}-${scan.seatClass || 'ANY'}-${scan.preferredTrain || 'ALL'}`;

                    try {
                        const res = await axiosInstance.post(
                            '/tickets',
                            {
                                from: scan.from,
                                to: scan.to,
                                date: formatDate,
                                seatClass: scan.seatClass,
                                seatCount: scan.seatCount,
                                preferredTrain: scan.preferredTrain,
                            },
                            { signal: abortController.signal }
                        );

                        if (currentRequestId !== scanRequestIdRef.current) return;

                        const rawTickets = (res.data.data || []) as ITicket[];
                        const newTickets = rawTickets.map((t) => ({
                            ...t,
                            from: scan.from,
                            to: scan.to,
                        }));

                        const prevTickets = ticketsObjRef.current[key] || [];
                        let newlyFound = false;
                        let bestFound: ITicket | null = null;

                        newTickets.forEach((newTicket) => {
                            const matchOldTicket = prevTickets.find(
                                (old) =>
                                    old.trainName === newTicket.trainName &&
                                    old.class === newTicket.class,
                            );

                            if (
                                matchOldTicket &&
                                newTicket.seats > matchOldTicket.seats
                            ) {
                                newlyFound = true;
                                if (!bestFound || newTicket.seats > bestFound.seats) {
                                    bestFound = newTicket;
                                }
                            }
                            if (!matchOldTicket && newTicket.seats > 0) {
                                newlyFound = true;
                                if (!bestFound || newTicket.seats > bestFound.seats) {
                                    bestFound = newTicket;
                                }
                            }
                        });

                        if (newlyFound && bestFound) {
                            notificationAudio.current.play().catch(() => {});
                            newTicketToast(bestFound);
                        }

                        // Immutable state update: generate fresh ticket objects
                        const updatedList: ITicket[] = newTickets.map((t) => ({ ...t }));

                        prevTickets.forEach((oldTicket) => {
                            if (
                                !updatedList.some(
                                    (u) =>
                                        u.trainName === oldTicket.trainName &&
                                        u.class === oldTicket.class,
                                )
                            ) {
                                updatedList.push({
                                    ...oldTicket,
                                    seats: 0,
                                    now: new Date().toISOString(),
                                });
                            }
                        });

                        setTicketsObj((prev) => ({
                            ...prev,
                            [key]: updatedList,
                        }));
                    } catch (err: unknown) {
                        const isCanceled =
                            (err as { name?: string })?.name === 'CanceledError' ||
                            (err as { name?: string })?.name === 'AbortError';
                        if (isCanceled) return;

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
                    }
                }),
            );
        } finally {
            inFlightRef.current = false;
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

    // Live clock ticker & 7:59:58 AM precision trigger
    useEffect(() => {
        const timer = setInterval(() => {
            const now = moment().tz('Asia/Dhaka');
            setBstClock(now.format('hh:mm:ss A'));

            const hours = now.hours();
            const minutes = now.minutes();
            const seconds = now.seconds();

            // Calculate seconds to 8:00:00 AM (if between 7:50 and 8:00)
            if (hours === 7 && minutes >= 50) {
                const diff = (60 - minutes - 1) * 60 + (60 - seconds);
                setSecondsTo8Am(diff);
            } else if (hours === 8 && minutes === 0 && seconds <= 15) {
                setSecondsTo8Am(0);
            } else {
                setSecondsTo8Am(null);
            }

            // High-Speed Precision Burst at 07:59:58 to 08:00:10 AM
            const isBurstWindow =
                (hours === 7 && minutes === 59 && seconds >= 58) ||
                (hours === 8 && minutes === 0 && seconds <= 10);

            if (isBurstWindow) {
                setIsBurstActive(true);
                inBurstRef.current = true;
                if (!isFetching) {
                    fetchAllTickets();
                }
            } else {
                setIsBurstActive(false);
                inBurstRef.current = false;
            }
        }, 500);

        return () => clearInterval(timer);
    }, [fetchAllTickets, isFetching]);

    // Automatic countdown interval
    useEffect(() => {
        const interval = setInterval(() => {
            if (inBurstRef.current) return;
            setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Dedicated effect to trigger periodic scans outside the state updater
    useEffect(() => {
        if (countdown === 0 && !inBurstRef.current) {
            setCountdown(SCAN_INTERVAL_SECONDS);
            fetchAllTickets();
        }
    }, [countdown, fetchAllTickets]);

    // Abort in-flight scans on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            inFlightRef.current = false;
        };
    }, []);

    const handleManualScan = () => {
        setCountdown(SCAN_INTERVAL_SECONDS);
        fetchAllTickets();
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        inFlightRef.current = false;
        navigate('/');
    };

    const handleTestNotificationAudio = () => {
        notificationAudio.current.play().catch(() => {});
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

    const neededSeats = scans[0]?.seatCount || 1;
    const requestedClass =
        scans[0]?.seatClass && scans[0]?.seatClass !== 'ANY'
            ? scans[0]?.seatClass
            : null;

    const ticketsArray: ITicket[] = Object.values(ticketsObj).flat();
    const ticketsWithSufficientSeats = ticketsArray.filter(
        (t) => t.seats >= neededSeats,
    );
    const availableTickets = ticketsArray.filter((t) => t.seats > 0);
    const topAvailableTicket =
        ticketsWithSufficientSeats.length > 0
            ? [...ticketsWithSufficientSeats].sort((a, b) => b.seats - a.seats)[0]
            : availableTickets.length > 0
              ? [...availableTickets].sort((a, b) => b.seats - a.seats)[0]
              : null;

    const activeRoute = scans[0]
        ? `${scans[0].from} ➔ ${scans[0].to} (${scans[0].date ? formatDateToStr(scans[0].date) : ''})`
        : 'Active Journey';

    const syncTargetToExtension = (ticket: ITicket) => {
        const matchingScan =
            scans.find((s) => s.from === ticket.from && s.to === ticket.to) ||
            scans[0];
        const targetSeats = matchingScan?.seatCount || neededSeats;
        const targetDate = matchingScan?.date
            ? formatDateToStr(matchingScan.date)
            : scans[0]?.date
              ? formatDateToStr(scans[0].date)
              : '';

        const payload = {
            train: ticket.trainName,
            train_number: ticket.trainNumber || (ticket.trainName.match(/\b\d{3,4}\b/) || [])[0] || '',
            trainNumber: ticket.trainNumber || (ticket.trainName.match(/\b\d{3,4}\b/) || [])[0] || '',
            seats: targetSeats,
            class: ticket.class,
            seatClass: ticket.class,
            from: ticket.from,
            to: ticket.to,
            date: targetDate,
            autocut: true,
            autoCut: true,
            timestamp: Date.now(),
        };
        try {
            localStorage.setItem('trainsolo_booking_target', JSON.stringify(payload));
            window.dispatchEvent(new CustomEvent('trainsolo:sync-target', { detail: payload }));
        } catch (_) {}
    };

    return (
        <div className="min-h-[90dvh] max-w-5xl mx-auto space-y-4">
            {/* Live Bangladesh Railway Clock & 8:00 AM Drop Synchronizer */}
            <div className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-lg border border-slate-700 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl animate-pulse">🕒</span>
                    <div>
                        <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                            Bangladesh Standard Time (BST)
                        </div>
                        <div className="text-lg font-mono font-bold text-emerald-400">
                            {bstClock || moment().format('hh:mm:ss A')}
                        </div>
                    </div>
                </div>

                {secondsTo8Am !== null ? (
                    <div className="flex items-center gap-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 px-4 py-2 rounded-xl font-bold text-sm shadow-inner">
                        <span>🎯 8:00 AM Ticket Drop in:</span>
                        <span className="font-mono text-base text-amber-200 font-black">
                            {secondsTo8Am === 0 ? 'DROP IS LIVE!' : `${secondsTo8Am}s`}
                        </span>
                    </div>
                ) : (
                    <div className="text-xs text-slate-300 bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700">
                        ⏰ Smart Drop Burst armed for <strong className="text-emerald-400">07:59:58 AM</strong>
                    </div>
                )}

                {isBurstActive && (
                    <div className="bg-red-600 text-white px-4 py-1.5 rounded-xl text-xs font-black animate-bounce shadow-xl flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                        8:00 AM HIGH-SPEED BURST SCANNING ACTIVE
                    </div>
                )}
            </div>

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
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5">
                            <span>Route: <strong className="text-gray-700">{activeRoute}</strong></span>
                            <span>•</span>
                            <span>Needed: <strong className="text-emerald-700 font-bold">{neededSeats} {neededSeats > 1 ? 'Seats' : 'Seat'}</strong></span>
                            {requestedClass && (
                                <>
                                    <span>•</span>
                                    <span>Class: <strong className="text-blue-700 font-semibold">{requestedClass}</strong></span>
                                </>
                            )}
                        </div>
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

            {/* HERO DIRECT ONE-CLICK AUTO-CUT CARD (When tickets are available) */}
            {topAvailableTicket && (
                <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 text-white p-5 sm:p-6 rounded-2xl shadow-xl border-2 border-emerald-400 flex flex-col md:flex-row items-center justify-between gap-5 transition-all">
                    <div className="space-y-1.5 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 bg-emerald-950/50 text-emerald-200 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-emerald-400/40">
                            <span>⚡ TOP AVAILABLE MATCH</span>
                            <span>•</span>
                            <span>{topAvailableTicket.seats} Seats in Inventory</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow">
                            {topAvailableTicket.trainName} • <span className="text-amber-300">{topAvailableTicket.class}</span>
                        </h2>
                        <p className="text-sm text-emerald-100 font-medium">
                            {topAvailableTicket.from} ➔ {topAvailableTicket.to} • Departs {topAvailableTicket.departureDateTime} • ৳{topAvailableTicket.fare}
                        </p>
                    </div>
                    <a
                        href={`${topAvailableTicket.link}#autocut=1`}
                        onClick={() => syncTargetToExtension(topAvailableTicket)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full md:w-auto"
                    >
                        <Button
                            size="lg"
                            className="w-full md:w-auto text-base sm:text-lg font-black bg-amber-400 hover:bg-amber-300 text-gray-900 shadow-2xl px-8 py-7 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 border-2 border-white/40"
                        >
                            ⚡ AUTO-CUT & GO TO OTP NOW ⚡
                        </Button>
                    </a>
                </div>
            )}

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
                            <TableRow className="text-sm bg-gray-50/70">
                                <TableHead className="w-[180px] font-bold text-emerald-800 bg-emerald-50/80">
                                    ⚡ One-Click Action
                                </TableHead>
                                <TableHead>Train Name</TableHead>
                                <TableHead>Class</TableHead>
                                <TableHead>Seats</TableHead>
                                <TableHead>Departure</TableHead>
                                <TableHead>Fare</TableHead>
                                <TableHead>From ➔ To</TableHead>
                                <TableHead>Found At</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ticketsArray.map((ticket, index) => (
                                <TableRow key={index} className="h-12 hover:bg-gray-50">
                                    <TableCell className="bg-emerald-50/40 font-medium">
                                        {ticket.seats ? (
                                            <a
                                                href={`${ticket.link}#autocut=1`}
                                                onClick={() => syncTargetToExtension(ticket)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <Button
                                                    size="sm"
                                                    className="cursor-pointer bg-[#16a34a] hover:bg-[#15803d] text-white font-bold flex items-center gap-1.5 shadow-sm whitespace-nowrap text-xs px-3 py-1.5"
                                                >
                                                    ⚡ Auto-Cut & OTP
                                                </Button>
                                            </a>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Sold out</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-bold text-gray-900">
                                        {ticket.trainName}
                                    </TableCell>
                                    <TableCell>
                                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                                            {ticket.class}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`font-black text-sm ${
                                                ticket.seats > 0
                                                    ? 'text-emerald-600'
                                                    : 'text-gray-400'
                                            }`}
                                        >
                                            {ticket.seats}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-xs font-medium text-gray-700">
                                        {ticket.departureDateTime}
                                    </TableCell>
                                    <TableCell className="font-semibold text-gray-800">
                                        ৳ {ticket.fare}
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-600">
                                        {ticket.from} ➔ {ticket.to}
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-400">
                                        {moment(ticket.now).format('h:mm:ss a')}
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
