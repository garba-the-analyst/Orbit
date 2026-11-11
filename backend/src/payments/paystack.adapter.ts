/**
 * Paystack payment gateway adapter.
 *
 * ORBIT talks to Paystack through one narrow path: a signed webhook event that says
 * "this reference was paid (or failed) for this amount". The adapter:
 *   - Initializes a Paystack transaction (`POST /transaction/initialize`) and returns the
 *     authorization URL the app sends the customer to.
 *   - Verifies Paystack webhooks (`x-paystack-signature` = HMAC-SHA512 of the raw body).
 *   - Maps Paystack events onto ORBIT's `GatewayEvent` shape so the existing
 *     `handleEvent` / `applyPaymentResult` path is reused unchanged.
 *
 * Amounts are in kobo (NGN minor unit) when sent to Paystack; ORBIT stores whole naira.
 *
 * Behind `PAYMENT_PROVIDER=paystack` — off by default (hard rule: payments stay in test mode
 * until a real gateway is explicitly opted into).
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { config } from '../config/config';
import { GatewayEvent } from './payments.service';

const PAYSTACK_BASE = 'https://api.paystack.co';

/** Shape returned by Paystack's initialize endpoint. */
interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

/** Shape of a Paystack webhook payload. */
interface PaystackWebhookEvent {
  event: string;
  data: {
    reference: string;
    amount: number; // in kobo
    currency: string;
    status: string;
  };
}

@Injectable()
export class PaystackAdapter {
  private readonly logger = new Logger(PaystackAdapter.name);

  /** Initializes a Paystack transaction for an order. Returns the authorization URL. */
  async initializeTransaction({
    email,
    amount, // whole naira
    reference,
    callbackUrl,
  }: {
    email: string;
    amount: number;
    reference: string;
    callbackUrl: string;
  }): Promise<{ authorizationUrl: string; accessCode: string; reference: string }> {
    const amountKobo = Math.round(amount * 100);
    const body = JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      callback_url: callbackUrl,
      metadata: { cancel_action: callbackUrl },
    });

    let res: Response;
    try {
      res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch (e) {
      this.logger.error(`Paystack initialize request failed: ${e}`);
      throw new BadRequestException('Could not reach the payment gateway. Try again.');
    }

    const data: PaystackInitializeResponse = (await res.json()) as PaystackInitializeResponse;
    if (!res.ok || !data.status) {
      this.logger.warn(`Paystack initialize failed: ${data.message ?? res.status}`);
      throw new BadRequestException(data.message ?? 'Could not start payment. Try again.');
    }

    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  }

  /** Verifies a Paystack webhook signature (HMAC-SHA512 over the raw body). */
  verifyWebhookSignature(rawBody: Buffer, signature?: string): boolean {
    if (!signature || !config.paystack.secretKey) return false;
    const expected = require('node:crypto')
      .createHmac('sha512', config.paystack.secretKey)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && require('node:crypto').timingSafeEqual(a, b);
  }

  /** Maps a Paystack webhook payload onto ORBIT's GatewayEvent. */
  mapWebhookEvent(payload: unknown): GatewayEvent | null {
    const evt = payload as PaystackWebhookEvent;
    if (!evt?.event || !evt?.data?.reference) return null;

    let event: GatewayEvent['event'];
    if (evt.event === 'charge.success') event = 'charge.success';
    else if (evt.event === 'charge.failed') event = 'charge.failed';
    else return null;

    // Paystack amounts are in kobo; ORBIT stores whole naira.
    const amountNaira = Math.round(evt.data.amount / 100);
    return { event, data: { reference: evt.data.reference, amount: amountNaira } };
  }

  /** Verifies a transaction directly with Paystack (used by the return/callback endpoint). */
  async verifyTransaction(reference: string): Promise<{ status: string; amount: number; currency: string }> {
    let res: Response;
    try {
      res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
        },
      });
    } catch (e) {
      this.logger.error(`Paystack verify request failed: ${e}`);
      throw new BadRequestException('Could not verify payment. Try again.');
    }

    const data: { status: boolean; message: string; data: { status: string; amount: number; currency: string } } = (await res.json()) as { status: boolean; message: string; data: { status: string; amount: number; currency: string } };
    if (!res.ok || !data.status) {
      this.logger.warn(`Paystack verify failed: ${data.message ?? res.status}`);
      throw new BadRequestException(data.message ?? 'Could not verify payment.');
    }

    return {
      status: data.data.status,
      amount: Math.round(data.data.amount / 100), // kobo → naira
      currency: data.data.currency,
    };
  }
}
