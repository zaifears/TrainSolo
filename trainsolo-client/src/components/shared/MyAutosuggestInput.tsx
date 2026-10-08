import { useState } from 'react';
import { useCombobox } from 'downshift';
import type { Dispatch, SetStateAction } from 'react';
import { citiesOptions } from '@/constants/searchCities';
import type { TStation } from '@/types/station.type';
import { Input } from '../ui/input';
import { cn } from '@/lib/utils';

type TAutoSuggestionInputProps = {
    placeholder: string;
    value: string;
    setValue: Dispatch<SetStateAction<string>>;
    id?: string;
    hasError?: boolean;
    ariaInvalid?: boolean;
    ariaDescribedBy?: string;
};

const MyAutosuggestInput = ({
    placeholder,
    value,
    setValue,
    id,
    hasError = false,
    ariaInvalid,
    ariaDescribedBy,
}: TAutoSuggestionInputProps) => {
    const [items, setItems] = useState<TStation[]>([]);

    const getFilteredItems = (input: string) => {
        if (input.length < 1) return []; // show nothing if less than 1 char
        return citiesOptions.filter((city) =>
            city.name.toLowerCase().startsWith(input.toLowerCase()),
        );
    };

    const {
        isOpen,
        getMenuProps,
        getInputProps,
        getItemProps,
        highlightedIndex,
        selectedItem,
    } = useCombobox<TStation>({
        items,
        inputValue: value,
        onInputValueChange: ({ inputValue }) => {
            const safeInput = inputValue || '';
            setValue(safeInput);
            setItems(getFilteredItems(safeInput));
        },
        itemToString: (item) => (item ? item.name : ''),
    });

    return (
        <div className="relative w-full">
            <Input
                className={cn(
                    'h-9 text-sm font-normal placeholder:font-light bg-white border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2',
                    hasError && 'border-red-500 focus-visible:ring-red-500',
                )}
                placeholder={placeholder}
                aria-invalid={ariaInvalid ?? hasError}
                aria-describedby={ariaDescribedBy}
                {...getInputProps({ id })}
            />
            <ul
                className={`absolute z-10 bg-white border border-gray-300 rounded-md shadow-md mt-1 w-full max-h-60 overflow-y-auto text-sm ${
                    !(isOpen && items.length) ? 'hidden' : ''
                }`}
                {...getMenuProps()}
            >
                {isOpen &&
                    items.map((item, index) => (
                        <li
                            key={index}
                            {...getItemProps({ item, index })}
                            className={`px-3 py-2 cursor-pointer ${
                                highlightedIndex === index ? 'bg-sky-100' : ''
                            } ${selectedItem === item ? 'font-bold' : ''}`}
                        >
                            {item.name}
                        </li>
                    ))}
            </ul>
        </div>
    );
};

export default MyAutosuggestInput;
