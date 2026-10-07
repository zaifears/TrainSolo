import Heading from '@/components/shared/Heading';
import { Button } from '@/components/ui/button';
import { getFromLocalStorage } from '@/utils/localStorage';
import { useEffect } from 'react';
import { FaChrome } from 'react-icons/fa6';
import { Link, useNavigate } from 'react-router';

const Login = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const checkAuth = () => {
            const token = getFromLocalStorage('token');
            const ssdk = getFromLocalStorage('ssdk');
            const uudid = getFromLocalStorage('uudid');

            if (token && ssdk && uudid) {
                navigate('/');
            }
        };

        checkAuth();
        window.addEventListener('storage', checkAuth);
        const timer = setInterval(checkAuth, 600);
        return () => {
            window.removeEventListener('storage', checkAuth);
            clearInterval(timer);
        };
    }, [navigate]);

    return (
        <div className="bg-white p-4 rounded-2xl max-w-xl mx-auto">
            <div className="mb-6 space-y-0.5">
                <Heading />
            </div>

            <div className="space-y-4">
                <div className="text-center space-y-0">
                    <h2 className="text-lg font-semibold text-gray-700">
                        Get Started in 2 Simple Steps
                    </h2>
                    <p className="text-sm text-gray-500">
                        Use the TrainSolo Assistant extension to sync your Bangladesh Railway
                        account in one click.
                    </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-[#1ca559] text-white rounded-full flex items-center justify-center text-sm font-bold">
                            1
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-700">
                                Load TrainSolo Extension
                            </p>
                            <p className="text-xs text-gray-500">
                                Load the trainsolo-extension unpacked in your Chrome or Brave extensions menu.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-[#1ca559] text-white rounded-full flex items-center justify-center text-sm font-bold">
                            2
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-700">
                                Sync Your Railway Account
                            </p>
                            <p className="text-xs text-gray-500">
                                Log in to eticket.railway.gov.bd, open the extension, and click "Sync & Open TrainSolo".
                            </p>
                        </div>
                    </div>
                </div>
                <Link
                    to="/instructions/pc-instructions.jpg"
                    target="_blank"
                    className="block"
                >
                    <Button className="w-full text-base cursor-pointer bg-[#1ca559] hover:bg-[#167457]">
                        <FaChrome className="text-lg" />
                        View Extension Setup Guide
                    </Button>
                </Link>
            </div>

            <p className="text-sm text-center text-gray-600 pt-3">
                You can also use{' '}
                <Link
                    to="/login-advanced"
                    className="font-semibold text-[#178b4c] hover:text-[#107a40] hover:underline"
                >
                    Advanced Login
                </Link>{' '}
                to log in manually.
            </p>
        </div>
    );
};

export default Login;
