import { useEffect, useState } from 'react';
import StationInputSingle from './StationInputSingle';
import Heading from '@/components/shared/Heading';
import { Button } from '@/components/ui/button';
import { HiSparkles } from 'react-icons/hi';
import { FiLogOut, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';
import useTicketContext from '@/hooks/useTicketContext';
import { useNavigate } from 'react-router';
import axiosInstance from '@/helpers/axiosInstance';
import {
    getFromLocalStorage,
    setToLocalStorage,
    removeFromLocalStorage,
} from '@/utils/localStorage';

const StationInput = () => {
    const [name, setName] = useState('');
    const [isVerifying, setIsVerifying] = useState(true);
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
                console.warn('Background profile check note:', error.message);
                // Keep session intact so ticket scanning and booking are never interrupted!
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

    const handleScan = () => {
        const filledScans = scans.filter((s) => s.from || s.to || s.date);

        if (filledScans.length === 0) {
            toast.error('Please configure your journey to scan');
            return;
        }

        for (let i = 0; i < filledScans.length; i++) {
            const scan = filledScans[i];
            const prefix = filledScans.length > 1 ? `Scan ${i + 1}: ` : '';
            if (!scan.from) {
                toast.error(`${prefix}Please enter your departure station`);
                return;
            }
            if (!scan.to) {
                toast.error(`${prefix}Please enter your destination station`);
                return;
            }
            if (!scan.date) {
                toast.error(`${prefix}Please enter your journey date`);
                return;
            }
        }

        setScans(filledScans);
        navigate('/ticket-table');
    };

    const handleLogout = () => {
        removeFromLocalStorage('token');
        removeFromLocalStorage('ssdk');
        removeFromLocalStorage('uudid');
        navigate('/login');
        toast.success('Logout Successful');
    };

    if (isVerifying) {
        return (
            <div className="bg-white p-4 rounded-2xl max-w-lg mx-auto text-center py-7 shadow-sm">
                <Heading />
                <div className="flex flex-col items-center justify-center space-y-4 pt-7">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-gray-200 border-t-[#1ca559] rounded-full animate-spin"></div>
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
                    <div className="w-10 h-10 bg-gradient-to-br from-[#1ca559] to-[#167457] rounded-full flex items-center justify-center">
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
                    className="text-xs font-medium px-3.5 py-1.5 bg-[#e72a40] hover:bg-[#c0162a] text-white flex items-center gap-1.5 cursor-pointer rounded-lg"
                    onClick={handleLogout}
                >
                    <FiLogOut className="text-sm" />
                    Logout
                </Button>
            </div>

            {/* Station Input Form Card */}
            <div className="bg-white px-3 py-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm">
                <Heading />
                <div className="space-y-4 my-5">
                    {scans && scans.length ? (
                        scans.map((scan, index) => (
                            <StationInputSingle
                                key={index}
                                index={index}
                                scan={scan}
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
                    className="w-full text-base font-semibold cursor-pointer bg-[#1ca559] hover:bg-[#167457] text-white shadow-md transition-all py-3"
                    onClick={handleScan}
                >
                    ⚡ Start Scanning Tickets
                </Button>
            </div>
        </div>
    );
};

export default StationInput;
