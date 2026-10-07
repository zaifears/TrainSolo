import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import TicketProvider from './Providers/ticket.provider.tsx';
import { Toaster } from 'react-hot-toast';
import { RouterProvider } from 'react-router';
import router from './routers/Router.tsx';
import { Notifications } from 'react-push-notification';

// Seamlessly ingest auth credentials if synced from TrainSolo Assistant extension
try {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = urlParams.get('token') || hashParams.get('token');
    const ssdk = urlParams.get('ssdk') || hashParams.get('ssdk');
    const uudid = urlParams.get('uudid') || hashParams.get('uudid');

    const userName = urlParams.get('userName') || hashParams.get('userName');

    if (token) {
        localStorage.setItem('token', token);
        if (ssdk) localStorage.setItem('ssdk', ssdk);
        if (uudid) localStorage.setItem('uudid', uudid);
        if (userName) localStorage.setItem('userName', userName);
        // Strip tokens from URL to protect credentials from browser history
        window.history.replaceState({}, document.title, window.location.pathname || '/');
    }
} catch (e) {
    console.error('Failed to ingest sync tokens:', e);
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <TicketProvider>
            <RouterProvider router={router} />
            <Toaster />
            <Notifications />
        </TicketProvider>
    </StrictMode>,
);
