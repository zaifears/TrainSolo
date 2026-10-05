import MainLayout from '@/layouts/MainLayout';
import Login from '@/pages/login/Login';
import LoginAdvanced from '@/pages/login/LoginAdvanced';
import NotFound from '@/pages/NotFound/NotFound';
import StationInput from '@/pages/Scanning/StationInput';
import TicketTable from '@/pages/TicketTable/TicketTable';
import { createBrowserRouter } from 'react-router';

const router = createBrowserRouter([
    {
        path: '/',
        element: <MainLayout />,
        errorElement: <NotFound />,
        children: [
            {
                index: true,
                element: <StationInput />,
            },

            {
                path: 'input-stations',
                element: <StationInput />,
            },
            {
                path: 'ticket-table',
                element: <TicketTable />,
            },
            {
                path: 'login',
                element: <Login />,
            },
            {
                path: 'login-advanced',
                element: <LoginAdvanced />,
            },
        ],
    },
]);

export default router;
