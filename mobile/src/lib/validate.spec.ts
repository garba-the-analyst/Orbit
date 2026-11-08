import { describe, expect, it } from 'vitest';
import { addressError, emailError, nameError, parseNaira, passwordError, phoneError } from './validate';

describe('form validation mirrors the server rules', () => {
  it('accepts Nigerian numbers in common spellings and rejects others', () => {
    expect(phoneError('08031234567')).toBeNull();
    expect(phoneError('0803 123 4567')).toBeNull();
    expect(phoneError('+2348031234567')).toBeNull();
    expect(phoneError('0903-123-4567')).toBeNull();
    expect(phoneError('12345')).not.toBeNull();
    expect(phoneError('')).not.toBeNull();
    expect(phoneError('08331234567')).not.toBeNull(); // 083 is not a mobile prefix
  });

  it('requires a letter and a number in passwords of 8+ characters', () => {
    expect(passwordError('Strong123')).toBeNull();
    expect(passwordError('short1')).toMatch(/8 characters/);
    expect(passwordError('nonumbershere')).toMatch(/letter and one number/);
    expect(passwordError('12345678')).toMatch(/letter and one number/);
  });

  it('checks email shape, names and addresses', () => {
    expect(emailError('ada@example.com')).toBeNull();
    expect(emailError('ada@')).not.toBeNull();
    expect(emailError('  ')).not.toBeNull();
    expect(nameError('A')).not.toBeNull();
    expect(nameError('Ada Eze')).toBeNull();
    expect(addressError('Hostel A, Room 12')).toBeNull();
    expect(addressError('abc')).not.toBeNull();
  });

  it('parses typed naira amounts', () => {
    expect(parseNaira('2,800')).toBe(2800);
    expect(parseNaira('₦ 1 500')).toBe(1500);
    expect(parseNaira('12.5')).toBeNull();
    expect(parseNaira('abc')).toBeNull();
    expect(parseNaira('')).toBeNull();
  });
});
