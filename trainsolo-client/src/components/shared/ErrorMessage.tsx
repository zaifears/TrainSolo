type TErrorMessageProps = {
    message: string | undefined;
    id?: string;
};

const ErrorMessage = ({ message, id }: TErrorMessageProps) => {
    if (!message) {
        return null;
    }
    return (
        <p id={id} role="alert" className="text-xs text-red-600 font-medium">
            {message}
        </p>
    );
};

export default ErrorMessage;
