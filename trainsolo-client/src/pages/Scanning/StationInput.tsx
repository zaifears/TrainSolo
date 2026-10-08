import { useEffect, useState } from 'react';
import StationInputSingle, { type TScanError } from './StationInputSingle';
import Heading from '@/components/shared/Heading';
import { Button } from '@/components/ui/button';
import { HiSparkles } from 'react-icons/hi';
import { FiLogOut, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';
import useTicketContext from '@/hooks/useTicketContext';
import { useNavigate } from 'react-router';
import axiosInstance from '@/helpers/axiosInstance';
import type { TScan } from '@/types/scan.type';
import {
    getFromLocalStorage,
    setToLocalStorage,
    removeFromLocalStorage,
} from '@/utils/localStorage';

const StationInput = () => {
    const [name, setName] = useState('');
    const [isVerifying, setIsVerifying] = useState(true);
    const [scanErrors, setScanErrors] = useState<Record<number, TScanError>>({});
    const [formErrorSummary, setFormErrorSummary] = useState<string | null>(null);
    const { scans, setScans } = useTicketContext();
    const navigate = useNavigate();

    useEffect(() => {
        const token = getFromLocalStorage('token');
        const ssdk = getFromLocalStorage('ssdk');
        const uudid = getFromLocalStorage('uudid');

        if (!token || !ssdk || !uudid) {
            setIsVerifying(false);
            navigate('/login');
            return;
        }

        // Credentials present! Establish active session immediately
        const cachedName = getFromLocalStorage('userName') || 'Bangladesh Railway User';
        setName(cachedName);
        setIsVerifying(false);

        // Fetch fresh profile in the background without gatekeeping the app
        axiosInstance
            .get('/users/profile')
            .then((res) => {
                if (res.data?.data?.name) {
                    setName(res.data.data.name);
                    setToLocalStorage('userName', res.data.data.name);
                }
            })
            .catch((error) => {
                if (error.response?.status === 401 || error.response?.status === 403) {
                    removeFromLocalStorage('token');
                    removeFromLocalStorage('ssdk');
                    removeFromLocalStorage('uudid');
                    removeFromLocalStorage('userName');
                    toast.error('Railway session expired. Please reconnect.');
                    navigate('/login');
                } else {
                    console.warn('Background profile check note:', error.message);
                }
            });
    }, [navigate]);

    useEffect(() => {
        if (!scans || scans.length === 0) {
            setScans([
                {
                    from: '',
                    to: '',
                    date: undefined,
                    seatClass: 'ANY',
                    seatCount: 1,
                    preferredTrain: '',
                },
            ]);
        }
    }, [scans, setScans]);

    const handleFieldChange = (index: number, field: keyof TScan) => {
        setScanErrors((prev) => {
            if (!prev[index]) return prev;
            const updated = { ...prev[index] };
            if (field === 'from') delete updated.from;
            if (field === 'to') delete updated.to;
            if (field === 'date') delete updated.date;
            if (field === 'from' || field === 'to') delete updated.general;

            const next = { ...prev, [index]: updated };
            if (Object.keys(updated).length === 0) {
                delete next[index];
            }
            if (Object.keys(next).length === 0) {
                setFormErrorSummary(null);
            }
            return next;
        });
    };

    const handleScan = () => {
        const filledScans = scans.filter((s) => s.from || s.to || s.date);
        const newErrors: Record<number, TScanError> = {};
        let hasError = false;

        if (filledScans.length === 0) {
            setScanErrors({
                0: {
                    from: 'Departure station is required',
                    to: 'Destination station is required',
                    date: 'Journey date is required',
                },
            });
            setFormErrorSummary('Please configure your journey route and date to begin scanning.');
            toast.error('Please configure your journey to scan');
            return;
        }

        filledScans.forEach((scan, i) => {
            const err: TScanError = {};
            if (!scan.from || !scan.from.trim()) {
                err.from = 'Please select your departure station';
                hasError = true;
            }
            if (!scan.to || !scan.to.trim()) {
                err.to = 'Please select your destination station';
                hasError = true;
            }
            if (
                scan.from &&
                scan.to &&
                scan.from.trim().toLowerCase() === scan.to.trim().toLowerCase()
            ) {
                err.general = 'Departure and destination stations cannot be identical';
                hasError = true;
            }
            if (!scan.date) {
                err.date = 'Please select your journey date';
                hasError = true;
            }
            if (Object.keys(err).length > 0) {
                newErrors[i] = err;
            }
        });

        if (hasError) {
            setScanErrors(newErrors);
            setFormErrorSummary('Please fix the highlighted errors above to start scanning.');
            toast.error('Please complete all required journey fields');
            return;
        }

        setScanErrors({});
        setFormErrorSummary(null);
        setScans(filledScans);
        navigate('/ticket-table');
    };

    const handleLogout = () => {
        removeFromLocalStorage('token');
        removeFromLocalStorage('ssdk');
        removeFromLocalStorage('uudid');
        removeFromLocalStorage('userName');
        navigate('/login');
        toast.success('Logout Successful');
    };

    if (isVerifying) {
        return (
            <div className="bg-white p-4 rounded-2xl max-w-lg mx-auto text-center py-7 shadow-sm">
                <Heading />
                <div className="flex flex-col items-center justify-center space-y-4 pt-7">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-gray-200 border-t-emerald-600 rounded-full animate-spin"></div>
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-lg font-semibold text-gray-800">
                            Loading your account
                        </h3>
                        <p className="text-sm text-gray-600">
                            Please wait while we verify your railway credentials
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-4xl mx-auto">
            {/* User Greeting Bar */}
            <div className="bg-white p-4 rounded-2xl flex items-center justify-between border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-full flex items-center justify-center shadow-sm">
                        <FiUser className="text-white text-lg" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">
                            Bangladesh Railway Account
                        </p>
                        <h3 className="text-base font-semibold text-gray-800">
                            {name}
                        </h3>
                    </div>
                </div>
                <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs font-medium px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer rounded-lg"
                    onClick={handleLogout}
                >
                    <FiLogOut className="text-sm" />
                    Logout
                </Button>
            </div>

            {/* Station Input Form Card */}
            <div className="bg-white px-3 py-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <Heading />

                {formErrorSummary && (
                    <div
                        role="alert"
                        aria-live="polite"
                        className="p-3.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-700 font-semibold text-center shadow-xs"
                    >
                        ⚠️ {formErrorSummary}
                    </div>
                )}

                <div className="space-y-4 my-3">
                    {scans && scans.length ? (
                        scans.map((scan, index) => (
                            <StationInputSingle
                                key={index}
                                index={index}
                                scan={scan}
                                errors={scanErrors[index]}
                                onFieldChange={(field) => handleFieldChange(index, field)}
                            />
                        ))
                    ) : (
                        <div className="text-center py-8">
                            <HiSparkles className="text-4xl text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">
                                No scanning stations configured
                            </p>
                        </div>
                    )}
                </div>

                <Button
                    type="button"
                    size="lg"
                    className="w-full text-base font-semibold cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all py-3"
                    onClick={handleScan}
                >
                    ⚡ Start Scanning Tickets
                </Button>
            </div>
        </div>
    );
};

export default StationInput;
