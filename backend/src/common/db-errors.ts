/** True when a database error is a unique-index violation, on either SQLite or PostgreSQL. */
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string; driverError?: { code?: string; message?: string } } | null;
  const code = err?.code ?? err?.driverError?.code;
  const message = `${err?.message ?? ''} ${err?.driverError?.message ?? ''}`;
  return code === '23505' || code === 'SQLITE_CONSTRAINT' || code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed|duplicate key value/i.test(message);
}
