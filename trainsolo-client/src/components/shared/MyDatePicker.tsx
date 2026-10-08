import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import moment from 'moment-timezone';
import type { Dispatch, SetStateAction } from 'react';

type TMyDatePicker = {
    date: Date | undefined;
    setDate: Dispatch<SetStateAction<Date | undefined>>;
    id?: string;
    hasError?: boolean;
    ariaInvalid?: boolean;
    ariaDescribedBy?: string;
};

const MyDatePicker = ({
    date,
    setDate,
    id,
    hasError = false,
    ariaInvalid,
    ariaDescribedBy,
}: TMyDatePicker) => {
    const [open, setOpen] = useState(false);
    const todayInDhaka = moment.tz('Asia/Dhaka').startOf('day').toDate();
    const maxDateInDhaka = moment
        .tz('Asia/Dhaka')
        .add(10, 'days')
        .endOf('day')
        .toDate();

    const handleSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            setDate(selectedDate);
            setOpen(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    variant={'outline'}
                    aria-invalid={ariaInvalid ?? hasError}
                    aria-describedby={ariaDescribedBy}
                    className={cn(
                        'h-9 w-full justify-start border border-gray-300 bg-white hover:bg-white px-3 py-2 text-sm text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 cursor-pointer',
                        hasError && 'border-red-500 focus-visible:ring-red-500',
                        !date && 'text-muted-foreground hover:text-muted-foreground',
                    )}
                >
                    <CalendarIcon className="mr-1.5 size-4 " />
                    {date ? (
                        <span className="font-normal text-gray-800">
                            {moment(date).format('DD MMM, YYYY')}
                        </span>
                    ) : (
                        <span className="font-light text-muted-foreground">Pick a date</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleSelect}
                    fromDate={todayInDhaka}
                    toDate={maxDateInDhaka}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
};

export default MyDatePicker;
