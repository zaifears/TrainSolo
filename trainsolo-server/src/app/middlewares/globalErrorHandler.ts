/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ErrorRequestHandler } from 'express';
import status from 'http-status';
import { ZodError } from 'zod';

const globalErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
    let statusCode: number = err?.statusCode || status.INTERNAL_SERVER_ERROR;
    let message: string = err?.message || 'Something went wrong';
    let errorDetails: unknown = null;

    if (err instanceof ZodError) {
        statusCode = status.UNPROCESSABLE_ENTITY;
        message = 'Validation Error';
        errorDetails = err.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
    } else if (process.env.NODE_ENV !== 'production') {
        errorDetails = {
            message: err?.message,
            stack: err?.stack,
        };
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(errorDetails ? { error: errorDetails } : {}),
    });
};

export default globalErrorHandler;
