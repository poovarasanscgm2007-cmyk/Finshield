import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle Multer and upload validation errors as 400 Bad Request
  if (
    err.name === 'MulterError' ||
    message.includes('Invalid file format') ||
    message.includes('File too large') ||
    message.includes('Unexpected field')
  ) {
    statusCode = 400;
  }

  if (statusCode >= 500) {
    console.error(`[Error] ${statusCode} - ${message}`);
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack, details: err.details })
  });
};
