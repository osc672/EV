import { env } from '../config/env';
import { logger } from './logger';

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
  sendSms(phone: string, message: string): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    logger.info('sms_otp_console', { phone, code });
  }
  async sendSms(phone: string, message: string): Promise<void> {
    logger.info('sms_console', { phone, message });
  }
}

/**
 * Pluggable SMS provider. The console provider is used by default for local
 * development; wire Twilio/MSG91/Fast2SMS here for production.
 */
class HttpSmsProvider implements SmsProvider {
  constructor(private readonly apiKey: string) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.sendSms(phone, `Your EV Rescue verification code is ${code}. Valid for a few minutes.`);
  }

  async sendSms(phone: string, message: string): Promise<void> {
    // Generic HTTP hook — replace with the concrete provider payload.
    const res = await fetch('https://api.sms-provider.example/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ to: phone, from: env.SMS_SENDER_ID, message }),
    });
    if (!res.ok) {
      logger.error('sms_send_failed', { status: res.status, phone });
      throw new Error('SMS delivery failed');
    }
  }
}

export const smsProvider: SmsProvider =
  env.SMS_PROVIDER === 'console' || !env.SMS_API_KEY
    ? new ConsoleSmsProvider()
    : new HttpSmsProvider(env.SMS_API_KEY);
