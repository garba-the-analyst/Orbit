import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { registerDecorator, type ValidationOptions } from 'class-validator';
import { config } from '../config/config';
import { DEFAULT_MARKET } from './markets';

/**
 * Turns whatever a person typed into the international format (E.164, like +2348031234567), or null if it is not
 * a real phone number in a country ORBIT serves. "08031234567" is read as Nigerian; "+233 24 412 3456" as Ghanaian.
 */
export function normalisePhone(raw: unknown, defaultCountry: string = DEFAULT_MARKET): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s()-]/g, '');
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  if (!parsed.country || !config.markets.enabled.includes(parsed.country)) return null;
  return parsed.number;
}

/** class-transformer helper: replaces a valid phone with its international form and leaves anything else for the validator to reject. */
export const toE164 = ({ value }: { value: unknown }) => normalisePhone(value) ?? value;

/** Validates that a field is a real phone number in an enabled market (after toE164 has run). */
export function IsAppPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isAppPhone',
      target: object.constructor,
      propertyName,
      options: {
        message: () =>
          `Enter a valid phone number, like 08031234567 or +233244123456. ORBIT is available in ${config.markets.enabled
            .join(', ')}.`,
        ...options,
      },
      validator: { validate: (v: unknown) => typeof v === 'string' && /^\+\d{8,15}$/.test(v) },
    });
}
