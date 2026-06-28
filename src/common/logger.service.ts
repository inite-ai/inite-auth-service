import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import { requestContext } from './request-context';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

interface LogContext {
  [key: string]: any;
}

/**
 * Centralized logger service with structured logging
 * Follows Single Responsibility Principle - handles all logging logic
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private context?: string;
  private readonly isDev = process.env.NODE_ENV !== 'production';

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, context?: LogContext | string) {
    this.print('log', message, context);
  }

  error(message: string, trace?: string, context?: LogContext | string) {
    this.print('error', message, context, trace);
  }

  warn(message: string, context?: LogContext | string) {
    this.print('warn', message, context);
  }

  debug(message: string, context?: LogContext | string) {
    if (this.isDev) {
      this.print('debug', message, context);
    }
  }

  verbose(message: string, context?: LogContext | string) {
    if (this.isDev) {
      this.print('verbose', message, context);
    }
  }

  // OAuth specific logging methods
  oauth(action: string, data?: LogContext) {
    this.log(`🔐 [OAuth] ${action}`, data);
  }

  auth(action: string, data?: LogContext) {
    this.log(`🔑 [Auth] ${action}`, data);
  }

  session(action: string, data?: LogContext) {
    this.log(`🍪 [Session] ${action}`, data);
  }

  // eslint-disable-next-line max-params -- TODO(par-max): pass an options object / contract
  request(method: string, path: string, status: number, data?: LogContext) {
    const emoji = status >= 400 ? '❌' : '✅';
    this.log(`${emoji} [${method}] ${path} - ${status}`, data);
  }

  // eslint-disable-next-line max-params -- TODO(par-max): pass an options object / contract
  private print(level: LogLevel, message: string, context?: LogContext | string, trace?: string) {
    const timestamp = new Date().toISOString();
    const ctxName = typeof context === 'string' ? context : this.context;
    const requestId = requestContext.getRequestId();

    const logData = {
      timestamp,
      level: level.toUpperCase(),
      context: ctxName,
      ...(requestId ? { requestId } : {}),
      message,
      ...(typeof context === 'object' ? context : {}),
      ...(trace ? { trace } : {}),
    };

    // In production, output JSON for log aggregation
    if (!this.isDev) {
      console[level](JSON.stringify(logData));
      return;
    }

    // In development, pretty print
    const prefix = this.getEmoji(level);
    const contextStr = ctxName ? `[${ctxName}]` : '';
    
    if (typeof context === 'object' && Object.keys(context).length > 0) {
      console[level](`${prefix} ${contextStr} ${message}`, context);
    } else {
      console[level](`${prefix} ${contextStr} ${message}`);
    }

    if (trace) {
      console[level](trace);
    }
  }

  private getEmoji(level: LogLevel): string {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'debug': return '🔍';
      case 'verbose': return '📝';
      default: return '📋';
    }
  }
}

// Factory function for creating logger with context
export function createLogger(context: string): LoggerService {
  const logger = new LoggerService();
  logger.setContext(context);
  return logger;
}



