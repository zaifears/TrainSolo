import { LoggingConfig } from '../config/schema.js';

export class Logger {
  private config: LoggingConfig;

  constructor(config: LoggingConfig) {
    this.config = config;
  }

  private redact(message: string): string {
    if (!this.config.redactTokens) {
      return message;
    }

    // Redact Bearer tokens / JWTs
    let clean = message.replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, 'Bearer [REDACTED_TOKEN]');
    clean = clean.replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, '[REDACTED_JWT]');
    clean = clean.replace(/(token|ssdk|uudid|x-device-key|x-device-id|password)=([^&\s]+)/gi, '$1=[REDACTED]');
    clean = clean.replace(/("token"|"ssdk"|"uudid")\s*:\s*"[^"]+"/gi, '$1:"[REDACTED]"');
    return clean;
  }

  public debug(msg: string, ...args: any[]): void {
    if (this.config.level === 'debug') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${this.redact(msg)}`, ...args);
    }
  }

  public info(msg: string, ...args: any[]): void {
    if (['debug', 'info'].includes(this.config.level)) {
      console.log(`[INFO]  ${new Date().toISOString()} - ${this.redact(msg)}`, ...args);
    }
  }

  public warn(msg: string, ...args: any[]): void {
    if (['debug', 'info', 'warn'].includes(this.config.level)) {
      console.warn(`[WARN]  ${new Date().toISOString()} - ${this.redact(msg)}`, ...args);
    }
  }

  public error(msg: string, ...args: any[]): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${this.redact(msg)}`, ...args);
  }
}
