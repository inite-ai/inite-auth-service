import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import { requestContext } from './request-context';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

interface LogContext {
  [key: string]: unknown;
}

export interface RequestLogInput {
  method: string;
  path: string;
  status: number;
  data?: LogContext;
}

interface PrintInput {
  level: LogLevel;
  message: string;
  context?: LogContext | string;
  trace?: string;
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
    this.print({ level: 'log', message, context });
  }

  error(message: string, trace?: string, context?: LogContext | string) {
    this.print({ level: 'error', message, context, trace });
  }

  warn(message: string, context?: LogContext | string) {
    this.print({ level: 'warn', message, context });
  }

  debug(message: string, context?: LogContext | string) {
    if (this.isDev) {
      this.print({ level: 'debug', message, context });
    }
  }

  verbose(message: string, context?: LogContext | string) {
    if (this.isDev) {
      this.print({ level: 'verbose', message, context });
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

  request(input: RequestLogInput) {
    const { method, path, status, data } = input;
    const emoji = status >= 400 ? '❌' : '✅';
    this.log(`${emoji} [${method}] ${path} - ${status}`, data);
  }

  private print(input: PrintInput) {
    const { level, message, context, trace } = input;
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

    const emit = this.consoleFor(level);

    // In production, output JSON for log aggregation
    if (!this.isDev) {
      emit(JSON.stringify(logData));
      return;
    }

    // In development, pretty print
    const prefix = this.getEmoji(level);
    const contextStr = ctxName ? `[${ctxName}]` : '';

    if (typeof context === 'object' && Object.keys(context).length > 0) {
      emit(`${prefix} ${contextStr} ${message}`, context);
    } else {
      emit(`${prefix} ${contextStr} ${message}`);
    }

    if (trace) {
      emit(trace);
    }
  }

  /**
   * Map a LogLevel to its console method. `console` has no `verbose`, so that
   * level routes to `console.debug` (Nest's own convention) — every other
   * level keeps its same-named method, preserving stream + formatting.
   */
  private consoleFor(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case 'error':
        return (...args: unknown[]) => console.error(...args);
      case 'warn':
        return (...args: unknown[]) => console.warn(...args);
      case 'debug':
      case 'verbose':
        return (...args: unknown[]) => console.debug(...args);
      case 'log':
      default:
        return (...args: unknown[]) => console.log(...args);
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



