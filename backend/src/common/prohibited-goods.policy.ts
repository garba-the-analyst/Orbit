/**
 * Prohibited-goods policy (proposal section 4.2: "Restricted and prohibited goods will be excluded by policy").
 *
 * MVP enforcement is a keyword screen applied when a merchant creates or edits a product.
 * It is a first line of defence, not a substitute for merchant onboarding checks and admin review.
 */

const PROHIBITED_TERMS = [
  'alcohol', 'beer', 'wine', 'whisky', 'whiskey', 'vodka', 'liquor', 'gin',
  'cigarette', 'cigarettes', 'tobacco', 'shisha', 'vape',
  'cannabis', 'marijuana', 'weed', 'cocaine', 'heroin', 'codeine', 'tramadol', 'opioid',
  'prescription', 'antibiotic', 'antibiotics',
  'gun', 'pistol', 'firearm', 'ammunition', 'explosive', 'explosives', 'dynamite',
  'counterfeit', 'fake id', 'stolen',
];

const PATTERN = new RegExp(`\\b(${PROHIBITED_TERMS.map((t) => t.replace(/\s+/g, '\\s+')).join('|')})\\b`, 'i');

/** Returns the matched prohibited term, or null if the text is acceptable. */
export function findProhibitedTerm(...texts: Array<string | undefined | null>): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = PATTERN.exec(text);
    if (match) return match[1].toLowerCase();
  }
  return null;
}
