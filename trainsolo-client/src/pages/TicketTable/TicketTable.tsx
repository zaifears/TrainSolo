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
// Bot-safe burst floor: 2.8s + 0-350ms jitter (~19 req/min max, well under Shohoz WAF & server 40 req/min limit)
const MIN_BURST_INTERVAL_MS = 2800;

const SHOHOZ_MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatShohozDateClient(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const [year, monthNum, day] = parts;
        const month = SHOHOZ_MONTHS[parseInt(monthNum, 10) - 1];
        if (month) return `${day.padStart(2, '0')}-${month}-${year}`;
    }
    return dateStr;
}

const TicketTable = () => {
    const { scans } = useTicketContext();
    const [ticketsObj, setTicketsObj] = useState<Record<string, ITicket[]>>({});
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [countdown, setCountdown] = useState(SCAN_INTERVAL_SECONDS);
    const [scanCount, setScanCount] = useState(0);
    const [lastScanTime, setLastScanTime] = useState<string | null>(null);
    const [lastErrorMsg, setLastErrorMsg] = useState<string | null>(null);
    const [isAuthExpired, setIsAuthExpired] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(
        typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted',
    );

    // Hands-Free Zero-Click Auto-Cut & Warm Tab state
    const [autoDispatchArmed, setAutoDispatchArmed] = useState<boolean>(() => {
        try {
            return sessionStorage.getItem('trainsolo_handsfree_armed') !== '0';
        } catch {
            return true;
        }
    });
    const [isTabPrewarmed, setIsTabPrewarmed] = useState(false);
    const [manualBurstRemainingSec, setManualBurstRemainingSec] = useState(0);

    const notificationAudio = useRef(new Audio(audio));
    const navigate = useNavigate();
    const ticketsObjRef = useRef(ticketsObj);
    ticketsObjRef.current = ticketsObj;

    const inFlightRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const scanRequestIdRef = useRef(0);
    const lastFetchStartedAtRef = useRef<number>(0);
    const nextBurstAllowedAtRef = useRef<number>(0);
    const manualBurstUntilRef = useRef<number>(0);
    const autoDispatchArmedRef = useRef(autoDispatchArmed);
    autoDispatchArmedRef.current = autoDispatchArmed;
    const hasAutoDispatchedRef = useRef<string | null>(null);

    // Live Bangladesh Standard Time clock and precision drop triggers (8:00 AM West & 2:00 PM East)
    const [bstClock, setBstClock] = useState('');
    const [secondsToDrop, setSecondsToDrop] = useState<number | null>(null);
    const [activeDropLabel, setActiveDropLabel] = useState<string>('08:00 AM');
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
        if (inFlightRef.current || isAuthExpired) return;

        inFlightRef.current = true;
        const nowMs = Date.now();
        lastFetchStartedAtRef.current = nowMs;
        // Enforce bot-safe spacing with random 0-350ms jitter during burst mode
        nextBurstAllowedAtRef.current =
            nowMs + MIN_BURST_INTERVAL_MS + Math.floor(Math.random() * 350);
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
                    const partySize = scan.seatCount || 1;
                    // Disambiguate cache key with party size, class and train filter
                    const key = `${scan.from}-${scan.to}-${formatDate}-${scan.seatClass || 'ANY'}-${scan.preferredTrain || 'ALL'}-${partySize}`;

                    try {
                        const res = await axiosInstance.post(
                            '/tickets',
                            {
                                from: scan.from,
                                to: scan.to,
                                date: formatDate,
                                seatClass: scan.seatClass,
                                seatCount: partySize,
                                preferredTrain: scan.preferredTrain,
                            },
                            { signal: abortController.signal },
                        );

                        if (currentRequestId !== scanRequestIdRef.current) return;

                        const rawTickets = (res.data.data || []) as ITicket[];
                        // Attach provenance metadata to each ticket
                        const newTickets: ITicket[] = rawTickets.map((t) => ({
                            ...t,
                            from: scan.from,
                            to: scan.to,
                            scanId: key,
                            requiredSeats: partySize,
                            journeyDate: formatDate,
                            isStale: false,
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

                        // Zero-Click Hands-Free Auto-Dispatch when sufficient seats are found
                        const sufficientCandidates = newTickets
                            .filter((t) => t.seats >= (t.requiredSeats || partySize))
                            .sort((a, b) => b.seats - a.seats);
                        const bestSufficient = sufficientCandidates[0] || null;

                        if (bestSufficient) {
                            // Stop burst polling immediately so we don't waste Shohoz API quota while booking
                            manualBurstUntilRef.current = 0;
                            setManualBurstRemainingSec(0);
                            inBurstRef.current = false;
                            setIsBurstActive(false);

                            const dispatchKey = `${bestSufficient.trainName}-${bestSufficient.class}-${bestSufficient.journeyDate}`;
                            if (
                                autoDispatchArmedRef.current &&
                                hasAutoDispatchedRef.current !== dispatchKey
                            ) {
                                hasAutoDispatchedRef.current = dispatchKey;
                                const targetPayload = {
                                    train: bestSufficient.trainName,
                                    train_number:
                                        bestSufficient.trainNumber ||
                                        (bestSufficient.trainName.match(/\b\d{3,4}\b/) || [])[0] ||
                                        '',
                                    trainNumber:
                                        bestSufficient.trainNumber ||
                                        (bestSufficient.trainName.match(/\b\d{3,4}\b/) || [])[0] ||
                                        '',
                                    seats: bestSufficient.requiredSeats || partySize,
                                    class: bestSufficient.class,
                                    seatClass: bestSufficient.class,
                                    from: bestSufficient.from,
                                    to: bestSufficient.to,
                                    date: bestSufficient.journeyDate || formatDate,
                                    autocut: true,
                                    autoCut: true,
                                    timestamp: Date.now(),
                                };
                                const dispatchUrl = `${bestSufficient.link}#autocut=1`;
                                try {
                                    localStorage.setItem(
                                        'trainsolo_booking_target',
                                        JSON.stringify(targetPayload),
                                    );
                                    window.dispatchEvent(
                                        new CustomEvent('trainsolo:sync-target', {
                                            detail: targetPayload,
                                        }),
                                    );
                                    const hasExtensionBridge =
                                        document.documentElement.getAttribute(
                                            'data-trainsolo-extension',
                                        ) === 'active';
                                    if (hasExtensionBridge) {
                                        window.dispatchEvent(
                                            new CustomEvent('trainsolo:auto-dispatch', {
                                                detail: {
                                                    url: dispatchUrl,
                                                    target: targetPayload,
                                                },
                                            }),
                                        );
                                    } else {
                                        window.open(dispatchUrl, '_blank', 'noopener,noreferrer');
                                    }
                                    toast.success(
                                        `⚡ Hands-Free Auto-Cut launched for ${bestSufficient.trainName} (${bestSufficient.seats} seats)!`,
                                        { duration: 6000 },
                                    );
                                } catch {
                        // Ignore storage/dispatch errors
                    }
                            }
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
                                    isStale: false,
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

                        const statusCode = (err as { response?: { status?: number } })?.response?.status;
                        if (statusCode === 401 || statusCode === 403) {
                            setIsAuthExpired(true);
                            setTicketsObj({});
                            setLastErrorMsg('Bangladesh Railway session expired. Please re-authenticate.');
                            return;
                        }
                        if (statusCode === 429) {
                            // Immediately exit burst mode and back off if rate-limited
                            manualBurstUntilRef.current = 0;
                            setManualBurstRemainingSec(0);
                            inBurstRef.current = false;
                            setIsBurstActive(false);
                        }

                        // Mark existing tickets in this scan partition as stale
                        setTicketsObj((prev) => {
                            const existing = prev[key];
                            if (!existing) return prev;
                            return {
                                ...prev,
                                [key]: existing.map((t) => ({ ...t, isStale: true })),
                            };
                        });

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
    }, [scans, isAuthExpired]);

    // Initial immediate fetch on mount
    useEffect(() => {
        fetchAllTickets();
    }, [fetchAllTickets]);

    // Listen for pre-warm confirmation from TrainSolo Extension
    useEffect(() => {
        const onPrewarmStatus = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            if (detail?.ok) {
                setIsTabPrewarmed(true);
                toast.success('🔥 Railway booking tab is pre-warmed and ready for instant Auto-Cut!');
            }
        };
        window.addEventListener('trainsolo:prewarm-status', onPrewarmStatus);
        return () => window.removeEventListener('trainsolo:prewarm-status', onPrewarmStatus);
    }, []);

    // Live clock ticker & 8:00 AM (West) + 2:00 PM (East) + Manual 30s Bot-Safe Burst trigger
    useEffect(() => {
        if (isAuthExpired) return;

        const timer = setInterval(() => {
            const now = moment().tz('Asia/Dhaka');
            setBstClock(now.format('hh:mm:ss A'));

            const hours = now.hours();
            const minutes = now.minutes();
            const seconds = now.seconds();

            // Calculate countdown to 8:00 AM (West Zone) or 2:00 PM / 14:00 (East Zone)
            if (hours === 7 && minutes >= 50) {
                const diff = (60 - minutes - 1) * 60 + (60 - seconds);
                setSecondsToDrop(diff);
                setActiveDropLabel('08:00 AM');
            } else if (hours === 8 && minutes === 0 && seconds <= 45) {
                setSecondsToDrop(0);
                setActiveDropLabel('08:00 AM');
            } else if (hours === 13 && minutes >= 50) {
                const diff = (60 - minutes - 1) * 60 + (60 - seconds);
                setSecondsToDrop(diff);
                setActiveDropLabel('02:00 PM');
            } else if (hours === 14 && minutes === 0 && seconds <= 45) {
                setSecondsToDrop(0);
                setActiveDropLabel('02:00 PM');
            } else {
                setSecondsToDrop(null);
                setActiveDropLabel(hours >= 8 && hours < 14 ? '01:59:56 PM' : '07:59:56 AM');
            }

            // Update manual 30s burst countdown if active
            const nowMs = Date.now();
            const manualLeftMs = Math.max(0, manualBurstUntilRef.current - nowMs);
            setManualBurstRemainingSec(Math.ceil(manualLeftMs / 1000));

            // Scheduled Drop Windows (07:59:56-08:00:45 AM & 01:59:56-02:00:45 PM) or Manual 30s Burst
            const isScheduledBurst =
                ((hours === 7 || hours === 13) && minutes === 59 && seconds >= 56) ||
                ((hours === 8 || hours === 14) && minutes === 0 && seconds <= 45);
            const isBurstWindow = isScheduledBurst || manualLeftMs > 0;

            if (isBurstWindow) {
                setIsBurstActive(true);
                inBurstRef.current = true;
                // Enforce bot-safe minimum spacing (~2.8s - 3.15s) between burst requests
                if (!inFlightRef.current && nowMs >= nextBurstAllowedAtRef.current) {
                    fetchAllTickets();
                }
            } else {
                setIsBurstActive(false);
                inBurstRef.current = false;
            }
        }, 400);

        return () => clearInterval(timer);
    }, [fetchAllTickets, isAuthExpired]);

    // Automatic countdown interval
    useEffect(() => {
        if (isAuthExpired) return;

        const interval = setInterval(() => {
            if (inBurstRef.current) return;
            setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        return () => clearInterval(interval);
    }, [isAuthExpired]);

    // Dedicated effect to trigger periodic scans outside the state updater
    useEffect(() => {
        if (isAuthExpired) return;

        if (countdown === 0 && !inBurstRef.current) {
            setCountdown(SCAN_INTERVAL_SECONDS);
            fetchAllTickets();
        }
    }, [countdown, fetchAllTickets, isAuthExpired]);

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
        if (isAuthExpired) return;
        setCountdown(SCAN_INTERVAL_SECONDS);
        fetchAllTickets();
    };

    const handleToggleHandsFree = () => {
        setAutoDispatchArmed((prev) => {
            const next = !prev;
            try {
                sessionStorage.setItem('trainsolo_handsfree_armed', next ? '1' : '0');
            } catch {
                        // Ignore storage/dispatch errors
                    }
            if (next) {
                hasAutoDispatchedRef.current = null;
                toast.success('🤖 Hands-Free Auto-Cut ARMED! Will launch automatically the instant seats appear.');
            } else {
                toast('Hands-Free Auto-Cut paused (manual click mode).');
            }
            return next;
        });
    };

    const handleTriggerManualBurst = () => {
        if (isAuthExpired) return;
        if (manualBurstRemainingSec > 0) {
            manualBurstUntilRef.current = 0;
            setManualBurstRemainingSec(0);
            inBurstRef.current = false;
            setIsBurstActive(false);
            toast('30s Drop Burst stopped.');
            return;
        }
        manualBurstUntilRef.current = Date.now() + 30 * 1000;
        setManualBurstRemainingSec(30);
        setIsBurstActive(true);
        inBurstRef.current = true;
        toast.success('🎯 30s Special Train Burst active! Scanning at bot-safe ~2.8s intervals.');
        if (!inFlightRef.current) {
            fetchAllTickets();
        }
    };

    const handlePrewarmRailwayTab = () => {
        const primaryScan = scans[0];
        if (!primaryScan?.from || !primaryScan?.to || !primaryScan?.date) return;
        const isoDate = formatDateToStr(primaryScan.date);
        const shohozDate = formatShohozDateClient(isoDate);
        const seatClass =
            primaryScan.seatClass && primaryScan.seatClass !== 'ANY'
                ? primaryScan.seatClass
                : 'S_CHAIR';
        const partySize = primaryScan.seatCount || 1;
        const trainParam = primaryScan.preferredTrain || '';
        const prewarmUrl = `https://eticket.railway.gov.bd/booking/train/search?fromcity=${encodeURIComponent(
            primaryScan.from.trim(),
        )}&tocity=${encodeURIComponent(
            primaryScan.to.trim(),
        )}&doj=${encodeURIComponent(shohozDate)}&class=${encodeURIComponent(
            seatClass,
        )}&train=${encodeURIComponent(trainParam)}&seats=${partySize}`;

        const targetPayload = {
            train: trainParam,
            train_number: (trainParam.match(/\b\d{3,4}\b/) || [])[0] || '',
            trainNumber: (trainParam.match(/\b\d{3,4}\b/) || [])[0] || '',
            seats: partySize,
            class: seatClass,
            seatClass,
            from: primaryScan.from,
            to: primaryScan.to,
            date: isoDate,
            autocut: false,
            autoCut: false,
            timestamp: Date.now(),
        };

        try {
            localStorage.setItem('trainsolo_booking_target', JSON.stringify(targetPayload));
            const hasExtensionBridge =
                document.documentElement.getAttribute('data-trainsolo-extension') === 'active';
            if (hasExtensionBridge) {
                window.dispatchEvent(
                    new CustomEvent('trainsolo:prewarm-tab', {
                        detail: { url: prewarmUrl, target: targetPayload },
                    }),
                );
            } else {
                window.open(prewarmUrl, '_blank', 'noopener,noreferrer');
                setIsTabPrewarmed(true);
                toast.success('🔥 Opened Railway search tab! Keep it open for instant Drop Sniper.');
            }
        } catch {
                        // Ignore storage/dispatch errors
                    }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        inFlightRef.current = false;
        navigate('/');
    };

    const handleReauthenticate = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('ssdk');
        localStorage.removeItem('uudid');
        localStorage.removeItem('userName');
        navigate('/login');
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
                icon: <BsInfoCircleFill size={18} className="text-sky-500" />,
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
        (t) => t.seats >= (t.requiredSeats || neededSeats),
    );
    const availableTickets = ticketsArray.filter((t) => t.seats > 0);
    const topAvailableTicket =
        !isAuthExpired && ticketsWithSufficientSeats.length > 0
            ? [...ticketsWithSufficientSeats].sort((a, b) => b.seats - a.seats)[0]
            : !isAuthExpired && availableTickets.length > 0
              ? [...availableTickets].sort((a, b) => b.seats - a.seats)[0]
              : null;

    const activeRoute = scans[0]
        ? `${scans[0].from} ➔ ${scans[0].to} (${scans[0].date ? formatDateToStr(scans[0].date) : ''})`
        : 'Active Journey';

    const syncTargetToExtension = (ticket: ITicket) => {
        const matchingScan =
            scans.find(
                (s) =>
                    s.from === ticket.from &&
                    s.to === ticket.to &&
                    (s.date ? formatDateToStr(s.date) : '') === (ticket.journeyDate || ''),
            ) ||
            scans.find((s) => s.from === ticket.from && s.to === ticket.to) ||
            scans[0];

        const targetSeats = ticket.requiredSeats || matchingScan?.seatCount || neededSeats;
        const targetDate = ticket.journeyDate || (matchingScan?.date ? formatDateToStr(matchingScan.date) : '');

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
        } catch {
                        // Ignore storage/dispatch errors
                    }
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

                {secondsToDrop !== null ? (
                    <div className="flex items-center gap-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 px-4 py-2 rounded-xl font-bold text-sm shadow-inner">
                        <span>🎯 {activeDropLabel} Ticket Drop in:</span>
                        <span className="font-mono text-base text-amber-200 font-black">
                            {secondsToDrop === 0 ? 'DROP IS LIVE!' : `${secondsToDrop}s`}
                        </span>
                    </div>
                ) : (
                    <div className="text-xs text-slate-300 bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700">
                        ⏰ Smart Drop Burst armed for <strong className="text-emerald-400">{activeDropLabel}</strong> (8 AM & 2 PM)
                    </div>
                )}

                {isBurstActive && (
                    <div className="bg-red-600 text-white px-4 py-1.5 rounded-xl text-xs font-black animate-bounce shadow-xl flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                        {manualBurstRemainingSec > 0
                            ? `SPECIAL TRAIN BURST ACTIVE (${manualBurstRemainingSec}s)`
                            : 'BOT-SAFE HIGH-SPEED BURST ACTIVE (~2.8s)'}
                    </div>
                )}
            </div>

            {/* Header Status Bar */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div
                        className={`w-3 h-3 rounded-full ${
                            isAuthExpired
                                ? 'bg-red-500'
                                : isFetching
                                  ? 'bg-amber-500 animate-ping'
                                  : 'bg-emerald-500 animate-pulse'
                        } shadow-sm`}
                    />
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
                        {isAuthExpired ? (
                            <strong className="text-red-600">Scan Halted</strong>
                        ) : (
                            <>Next scan in: <strong className="text-emerald-700">{countdown}s</strong></>
                        )}
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

            {/* Permanent Auth Expiration Banner */}
            {isAuthExpired && (
                <div
                    role="alert"
                    aria-live="assertive"
                    className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-2xl text-center space-y-2.5 shadow-sm"
                >
                    <div className="font-bold text-sm flex items-center justify-center gap-2">
                        <span>🔒</span> Bangladesh Railway Session Expired
                    </div>
                    <p className="text-xs text-red-700 max-w-lg mx-auto">
                        Your railway access token is no longer valid. The scanner has been paused to prevent account lockout or rate-limiting.
                    </p>
                    <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer text-xs px-4 py-2"
                        onClick={handleReauthenticate}
                    >
                        Re-authenticate Credentials
                    </Button>
                </div>
            )}

            {/* Transient Error Banner */}
            {lastErrorMsg && !isAuthExpired && (
                <div
                    role="status"
                    aria-live="polite"
                    className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2.5 rounded-xl text-center"
                >
                    <span>⚠️ {lastErrorMsg} — Displayed inventory may be stale. Scanner will retry automatically.</span>
                    <span aria-hidden="true" className="ml-1 text-amber-600 font-semibold">(retry in {countdown}s)</span>
                </div>
            )}

            {/* HERO DIRECT ONE-CLICK AUTO-CUT CARD (When tickets are available) */}
            {topAvailableTicket && (
                <div className={`text-white p-5 sm:p-6 rounded-2xl shadow-xl border-2 flex flex-col md:flex-row items-center justify-between gap-5 transition-all ${
                    topAvailableTicket.isStale
                        ? 'bg-gradient-to-r from-amber-700 via-yellow-800 to-amber-900 border-amber-400'
                        : 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 border-emerald-400'
                }`}>
                    <div className="space-y-1.5 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 bg-black/40 text-emerald-200 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-white/20">
                            <span>⚡ TOP AVAILABLE MATCH</span>
                            <span>•</span>
                            <span>{topAvailableTicket.seats} Seats</span>
                            {topAvailableTicket.isStale && (
                                <span className="text-amber-300 font-extrabold">• (STALE INVENTORY)</span>
                            )}
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow">
                            {topAvailableTicket.trainName} • <span className="text-amber-300">{topAvailableTicket.class}</span>
                        </h2>
                        <p className="text-sm text-emerald-100 font-medium">
                            {topAvailableTicket.from} ➔ {topAvailableTicket.to} • Departs {topAvailableTicket.departureDateTime} • ৳{topAvailableTicket.fare}
                        </p>
                    </div>
                    <Button
                        asChild
                        size="lg"
                        className="w-full md:w-auto text-base sm:text-lg font-black bg-amber-400 hover:bg-amber-300 text-gray-900 shadow-2xl px-8 py-7 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 border-2 border-white/40"
                    >
                        <a
                            href={`${topAvailableTicket.link}#autocut=1`}
                            onClick={() => syncTargetToExtension(topAvailableTicket)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            ⚡ AUTO-CUT & GO TO OTP NOW ⚡
                        </a>
                    </Button>
                </div>
            )}

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap gap-2.5 justify-center">
                <Button
                    size="sm"
                    className={`cursor-pointer font-bold shadow-sm ${
                        autoDispatchArmed
                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-300'
                            : 'bg-slate-700 hover:bg-slate-800 text-white'
                    }`}
                    onClick={handleToggleHandsFree}
                    disabled={isAuthExpired}
                >
                    {autoDispatchArmed
                        ? '🤖 Hands-Free Auto-Cut: ARMED'
                        : '🤖 Hands-Free Auto-Cut: OFF'}
                </Button>

                <Button
                    size="sm"
                    className={`cursor-pointer font-semibold shadow-sm ${
                        isTabPrewarmed
                            ? 'bg-teal-700 hover:bg-teal-800 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                    onClick={handlePrewarmRailwayTab}
                    disabled={isAuthExpired}
                >
                    {isTabPrewarmed ? '🔥 Railway Tab Warm' : '🔥 Pre-Warm Railway Tab'}
                </Button>

                <Button
                    size="sm"
                    className={`cursor-pointer font-semibold shadow-sm ${
                        manualBurstRemainingSec > 0
                            ? 'bg-orange-600 hover:bg-orange-700 text-white animate-pulse'
                            : 'bg-rose-600 hover:bg-rose-700 text-white'
                    }`}
                    onClick={handleTriggerManualBurst}
                    disabled={isAuthExpired}
                >
                    {manualBurstRemainingSec > 0
                        ? `🛑 Stop Burst (${manualBurstRemainingSec}s)`
                        : '🎯 30s Special Train Burst'}
                </Button>

                <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer font-semibold shadow-sm"
                    onClick={handleManualScan}
                    disabled={isFetching || isAuthExpired}
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
                    className="bg-destructive hover:bg-destructive/90 text-white cursor-pointer"
                    onClick={handleStop}
                >
                    <IoStopCircle className="mr-1" />
                    Stop Scanner
                </Button>

                <Button
                    size="sm"
                    className="bg-sky-700 hover:bg-sky-800 text-white cursor-pointer"
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
                        className="bg-purple-700 hover:bg-purple-800 text-white cursor-pointer"
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

            {/* Results or Pre-Drop Standby Card */}
            {isInitialLoading ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="bg-white p-8 rounded-2xl text-center shadow-sm border border-gray-100 max-w-lg mx-auto"
                >
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
                                <TableRow key={`${ticket.trainName}-${ticket.class}-${index}`} className="h-12 hover:bg-gray-50">
                                    <TableCell className="bg-emerald-50/40 font-medium">
                                        {ticket.seats && !isAuthExpired ? (
                                            <Button
                                                asChild
                                                size="sm"
                                                className={`cursor-pointer text-white font-bold flex items-center gap-1.5 shadow-sm whitespace-nowrap text-xs px-3 py-1.5 ${
                                                    ticket.isStale
                                                        ? 'bg-amber-600 hover:bg-amber-700'
                                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                                }`}
                                            >
                                                <a
                                                    href={`${ticket.link}#autocut=1`}
                                                    onClick={() => syncTargetToExtension(ticket)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    {ticket.isStale ? '⚠️ Auto-Cut (Stale)' : '⚡ Auto-Cut & OTP'}
                                                </a>
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">
                                                {isAuthExpired ? 'Session expired' : 'Sold out'}
                                            </span>
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
                                                    ? ticket.isStale
                                                        ? 'text-amber-600'
                                                        : 'text-emerald-600'
                                                    : 'text-gray-400'
                                            }`}
                                        >
                                            {ticket.seats}
                                        </span>
                                        {ticket.isStale && (
                                            <span className="ml-1 text-[10px] text-amber-600 font-semibold">(stale)</span>
                                        )}
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
                <div
                    role="status"
                    aria-live="polite"
                    className="bg-white p-8 rounded-2xl max-w-xl mx-auto text-center shadow-sm border border-blue-100 space-y-4"
                >
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
                            The moment tickets unlock at 8:00 AM / 2:00 PM (or special train release),{' '}
                            {autoDispatchArmed
                                ? 'TrainSolo will automatically launch Auto-Cut in your warm Railway tab with 0-second delay!'
                                : 'the audio chime will ring and tickets will appear here instantly!'}
                        </p>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                        <Button
                            onClick={handlePrewarmRailwayTab}
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 cursor-pointer"
                            disabled={isAuthExpired}
                        >
                            {isTabPrewarmed
                                ? '🔥 Railway Tab Pre-Warmed'
                                : '🔥 Pre-Warm Railway Tab (Recommended)'}
                        </Button>
                        <Button
                            onClick={handleManualScan}
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 cursor-pointer"
                            disabled={isFetching || isAuthExpired}
                        >
                            {isFetching ? 'Checking now...' : '⚡ Scan Now (Instant Check)'}
                        </Button>
                        <span className="text-xs text-gray-400">
                            {isAuthExpired ? 'Halted' : `Auto-checking in ${countdown}s`}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TicketTable;
