/**
 * Logger Profissional para VetorControl Hub
 * Substitui console.log com logger estruturado
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  data?: any;
}

class Logger {
  private isDev = process.env.NODE_ENV === 'development';
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private log(level: LogLevel, tag: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      tag,
      message,
      data,
    };

    // Em desenvolvimento, mostrar no console
    if (this.isDev) {
      const color = this.getColor(level);
      console.log(
        `%c[${entry.timestamp}] [${level.toUpperCase()}] [${tag}]`,
        `color: ${color}; font-weight: bold`,
        message,
        data || ''
      );
    }

    // Armazenar em memória
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Em produção, enviar para serviço externo se necessário
    if (!this.isDev && level === 'error') {
      this.sendToService(entry);
    }
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return '#888888';
      case 'info':
        return '#3b82f6';
      case 'warn':
        return '#f59e0b';
      case 'error':
        return '#dc2626';
    }
  }

  private sendToService(entry: LogEntry) {
    // TODO: Integrar com Sentry ou outro serviço
    // fetch('/api/logs', { method: 'POST', body: JSON.stringify(entry) });
  }

  debug(tag: string, message: string, data?: any) {
    this.log('debug', tag, message, data);
  }

  info(tag: string, message: string, data?: any) {
    this.log('info', tag, message, data);
  }

  warn(tag: string, message: string, data?: any) {
    this.log('warn', tag, message, data);
  }

  error(tag: string, message: string, data?: any) {
    this.log('error', tag, message, data);
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  clear() {
    this.logs = [];
  }
}

export const logger = new Logger();
export default logger;
