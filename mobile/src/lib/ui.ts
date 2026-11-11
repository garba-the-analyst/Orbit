/** Small UI helpers: toasts, confirmations, haptics and error handling in one consistent voice. */
import { alertController, toastController } from '@ionic/vue';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ApiError } from '../api/client';

export async function toast(message: string, tone: 'ok' | 'error' = 'ok') {
  const t = await toastController.create({
    message,
    duration: tone === 'error' ? 4500 : 2200,
    position: 'top',
    cssClass: tone === 'error' ? 'toast-error' : '',
    color: tone === 'error' ? 'danger' : undefined,
  });
  await t.present();
}

/** Turns anything thrown into a message safe to show a person. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Try again.';
}

/** Shows an error toast and returns the message. */
export async function showError(err: unknown) {
  const message = errorMessage(err);
  await toast(message, 'error');
  return message;
}

/**
 * Asks before a consequential action. The confirm button names the action ("Cancel order"),
 * never a generic "OK".
 */
export async function confirmAction(opts: {
  title: string;
  message?: string;
  confirm: string;
  cancel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise(async (resolve) => {
    const alert = await alertController.create({
      header: opts.title,
      message: opts.message,
      buttons: [
        { text: opts.cancel ?? 'Keep it', role: 'cancel', handler: () => resolve(false) },
        { text: opts.confirm, role: opts.destructive ? 'destructive' : 'confirm', handler: () => resolve(true) },
      ],
    });
    alert.onDidDismiss().then(() => resolve(false));
    await alert.present();
  });
}

export async function tap() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics are a nicety */
  }
}

export async function success() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
}

/** Asks for a password (or any single line) in a dialog. Resolves to null when cancelled. */
export async function promptText(opts: { title: string; message?: string; placeholder?: string; type?: 'password' | 'text'; confirm: string }): Promise<string | null> {
  return new Promise(async (resolve) => {
    const alert = await alertController.create({
      header: opts.title,
      message: opts.message,
      inputs: [{ name: 'v', type: opts.type ?? 'text', placeholder: opts.placeholder, attributes: { autocomplete: opts.type === 'password' ? 'current-password' : 'off' } }],
      buttons: [
        { text: 'Cancel', role: 'cancel', handler: () => resolve(null) },
        { text: opts.confirm, handler: (d: { v?: string }) => resolve(d.v?.trim() ? d.v : null) },
      ],
    });
    alert.onDidDismiss().then(() => resolve(null));
    await alert.present();
  });
}
