import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import type { TScan } from '@/types/scan.type';
import { TicketContext } from './ticket.context';

const STORAGE_KEY = 'trainsolo_scans_config';

const TicketProvider = ({ children }: { children: ReactNode }) => {
    const [scans, setScans] = useState<TScan[]>(() => {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as TScan[];
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((s) => ({
                        ...s,
                        date: s.date ? new Date(s.date) : undefined,
                    }));
                }
            }
        } catch (_) {}
        return [{ from: '', to: '', date: undefined }];
    });

    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
        } catch (_) {}
    }, [scans]);

    const value = {
        scans,
        setScans,
    };

    return (
        <TicketContext.Provider value={value}>
            {children}
        </TicketContext.Provider>
    );
};

export default TicketProvider;
