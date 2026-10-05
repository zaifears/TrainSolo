import type { ReactNode } from 'react';
import { useState } from 'react';
import type { TScan } from '@/types/scan.type';
import { TicketContext } from './ticket.context';

const TicketProvider = ({ children }: { children: ReactNode }) => {
    const [scans, setScans] = useState<TScan[]>([
        { from: '', to: '', date: undefined },
    ]);
    const [inputCount, setInputCount] = useState(1);

    const value = {
        scans,
        setScans,
        inputCount,
        setInputCount,
    };

    return (
        <TicketContext.Provider value={value}>
            {children}
        </TicketContext.Provider>
    );
};

export default TicketProvider;
