import ErrorMessage from '@/components/shared/ErrorMessage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import getFieldError from '@/utils/getFieldError';
import { useFormContext } from 'react-hook-form';

type THInputProps = {
    label: string;
    name: string;
    type?: string;
    placeholder?: string;
};

const TInput = ({ label, name, type = 'text', placeholder }: THInputProps) => {
    const {
        register,
        formState: { errors },
    } = useFormContext();

    const fieldError = getFieldError(errors, name);
    const errorId = `${name}-error`;

    return (
        <div className="space-y-2">
            <Label htmlFor={name}>{label}</Label>
            <Input
                className={cn(
                    'h-9 text-base font-normal placeholder:font-light focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2',
                    {
                        'border-red-500 focus-visible:ring-red-500': fieldError,
                    },
                )}
                type={type}
                id={name}
                aria-invalid={!!fieldError}
                aria-describedby={fieldError ? errorId : undefined}
                placeholder={placeholder}
                {...register(name)}
            />
            <ErrorMessage id={errorId} message={fieldError?.message || ''} />
        </div>
    );
};

export default TInput;
