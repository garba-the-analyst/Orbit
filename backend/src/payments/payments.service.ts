/**
 * Payments.
 *
 * ORBIT talks to a payment gateway through one narrow path: a signed webhook event that says
 * "this reference was paid (or failed) for this amount". The MVP ships a MOCK gateway so the whole
 * flow can be demonstrated without real money:
 *   - `POST /payments/:reference/simulate` plays the part of the gateway for test payments, and
 *   - it goes through exactly the same handler (`handleEvent`) as the real webhook would.
 * Swapping in a real provider (e.g. Paystack or Flutterwave) means creating the checkout session with
 * their API and pointing their webhook at `POST /payments/webhook`; the verification below stays.
 *
 * Security
 * - Webhook bodies are authenticated with HMAC-SHA256 over the raw body (constant-time compare).
 * - The event amount must equal the amount ORBIT expected, so a tampered or underpaid event is rejected.
 * - Handling is idempotent: replayed events never apply twice.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { AuthUser } from '../common/auth.decorators';
import { OrderStatus } from '../common/enums';
import { signatureMatches } from '../common/pin.util';
import { config } from '../config/config';
import { Order } from '../orders/order.entity';
import { OrdersService } from '../orders/orders.service';
import { Payment } from './payment.entity';
import { PaystackAdapter } from './paystack.adapter';

export interface GatewayEvent {
  event: 'charge.success' | 'charge.failed';
  data: { reference: string; amount: number };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly paystack: PaystackAdapter,
  ) {}

  /** Verifies the signature of a raw webhook body and applies the event. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ ok: true }> {
    // Paystack sends x-paystack-signature (HMAC-SHA512); the mock/dev path uses x-orbit-signature (HMAC-SHA256).
    let ok = false;
    if (config.paymentProvider === 'paystack') {
      ok = !!rawBody && this.paystack.verifyWebhookSignature(rawBody, signature);
    } else {
      ok = !!rawBody && signatureMatches(rawBody, signature, config.webhookSecret);
    }
    if (!ok) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
    let evt: GatewayEvent;
    try {
      const parsed = JSON.parse(rawBody!.toString('utf8'));
      // Paystack sends the event at top level; ORBIT's mock sends { event, data } directly.
      if (config.paymentProvider === 'paystack' && parsed?.event && parsed?.data) {
        const mapped = this.paystack.mapWebhookEvent(parsed);
        if (!mapped) throw new BadRequestException('Unsupported payment event.');
        evt = mapped;
      } else {
        evt = parsed;
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Webhook body is not valid JSON.');
    }
    await this.handleEvent(evt);
    return { ok: true };
  }

  /**
   * Test-mode payment: lets the customer's app complete or fail a payment without a real gateway.
   * Disabled whenever a real provider is configured.
   */
  async simulate(user: AuthUser, reference: string, outcome: 'success' | 'failed'): Promise<{ ok: true }> {
    if (config.paymentProvider !== 'mock') throw new ForbiddenException('Test payments are disabled.');
    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment not found.');
    const order = await this.orders.findOne({ where: { id: payment.orderId } });
    if (!order || order.customerId !== user.id) throw new NotFoundException('Payment not found.');

    await this.handleEvent({
      event: outcome === 'success' ? 'charge.success' : 'charge.failed',
      data: { reference, amount: payment.amount },
    });
    return { ok: true };
  }

  /**
   * Initializes a real Paystack transaction for an order. Returns the authorization URL the app
   * sends the customer to (Paystack checkout inline or redirect). Only used when
   * PAYMENT_PROVIDER=paystack.
   */
  async initializePayment({
    userId,
    reference,
    customerEmail,
    callbackUrl,
  }: {
    userId: string;
    reference: string;
    customerEmail: string;
    callbackUrl: string;
  }): Promise<{ authorizationUrl: string; accessCode: string; reference: string }> {
    if (config.paymentProvider !== 'paystack') {
      throw new ForbiddenException('Paystack is not configured.');
    }
    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment not found.');
    const order = await this.orders.findOne({ where: { id: payment.orderId } });
    if (!order || order.customerId !== userId) throw new NotFoundException('Payment not found.');
    return this.paystack.initializeTransaction({ email: customerEmail, amount: payment.amount, reference, callbackUrl });
  }

  /**
   * Verifies a payment's status for the return/callback page. Checks our ledger first (the webhook
   * may already have applied the result), then falls back to a direct Paystack verification.
   */
  async verifyReturn(reference: string): Promise<'success' | 'failed' | 'pending'> {
    const payment = await this.payments.findOne({ where: { reference } });
    if (payment?.status === 'SUCCESS') return 'success';
    if (payment?.status === 'FAILED') return 'failed';

    // Fall back to Paystack directly if the webhook hasn't arrived yet.
    try {
      const result = await this.paystack.verifyTransaction(reference);
      return result.status === 'success' ? 'success' : 'failed';
    } catch {
      return 'pending';
    }
  }

  /** The single place a gateway result enters the system. */
  async handleEvent(evt: GatewayEvent): Promise<void> {
    if (!evt?.data?.reference || !['charge.success', 'charge.failed'].includes(evt.event)) {
      throw new BadRequestException('Unsupported payment event.');
    }
    const payment = await this.payments.findOne({ where: { reference: evt.data.reference } });
    if (!payment) throw new NotFoundException('Unknown payment reference.');

    if (evt.event === 'charge.success' && evt.data.amount !== payment.amount) {
      this.logger.warn(`Amount mismatch on ${payment.reference}: expected ${payment.amount}, got ${evt.data.amount}`);
      throw new BadRequestException('Payment amount does not match the order total.');
    }
    await this.ordersService.applyPaymentResult(payment.id, evt.event === 'charge.success');
  }

  /** Convenience for tests and support tooling: is this order paid? */
  async isPaid(orderId: string): Promise<boolean> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    return !!order && order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.CANCELLED;
  }
}
