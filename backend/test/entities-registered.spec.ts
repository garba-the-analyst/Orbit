import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { entities } from '../src/database/entities';

/** Regression: an @Entity missing from database/entities.ts works in sqlite/forFeature but 500s on Postgres
 * ("No metadata for X was found"), and is invisible to migrations. */
describe('entity registry', () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.entity.ts') || p.endsWith('.entities.ts') ? [p] : [];
    });

  it('registers every @Entity class', () => {
    const names = new Set((entities as { name: string }[]).map((e) => e.name));
    const declared = walk(join(__dirname, '..', 'src')).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/@Entity\([^)]*\)\s*export class (\w+)/g)].map((m) => m[1]),
    );
    expect(declared.length).toBeGreaterThan(10);
    expect(declared.filter((n) => !names.has(n))).toEqual([]);
  });
});
