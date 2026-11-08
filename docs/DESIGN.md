# ORBIT design system

How the app is meant to look and feel, why, and the rules that keep every screen consistent.
(Built with the `frontend-design` skill's process: brief, plan, critique against generic defaults, build.)

## Brief

- **Product:** ORBIT, a campus marketplace where students order food, groceries, stationery and gadgets from verified local shops, with a choice at checkout of who delivers it.
- **Audiences:** students on mid-range Android phones (customers); shop owners and kitchen staff working a counter (merchants); riders on the move, one-handed (riders); the ORBIT operations team (admin).
- **Primary job:** get something from a nearby shop to you quickly, and make the handover trustworthy. For merchants and riders: clear the queue fast without mistakes.
- **Vernacular we draw from:** Nigerian market signage, keke-napep yellow, waybills and dispatch slips, the delivery PIN, and the idea of an orbit: a short loop that always comes back to you.

## Plan

### Colour (named, and each has a job)

| Name | Hex | Used for |
| --- | --- | --- |
| Orbit ink | `#161A52` | Text, headings, selected states, secondary buttons. A deep indigo, not black. |
| Keke yellow | `#FFC400` | The primary action on each screen, and the "satellite" dot. Ink text on it passes AA with room to spare. |
| Cool paper | `#F4F5F9` | App background. Slightly blue-grey so it never reads as cream. |
| Surface | `#FFFFFF` | Inputs, sheets, anything you touch. |
| Slate | `#5A6180` | Secondary text. |
| Line | `#DDE0EC` | Dividers and input borders, only where they separate real information. |
| Signal green / red / amber | `#0E8A4F` / `#C8312B` / `#B25E00` | Open, delivered / problems, closed / waiting. Always paired with words, never colour alone. |

Each shop also brings its own **sign colour** (stored with the shop), the way real shops have a painted fascia. That is the only place colour varies.

### Type

- **Bricolage Grotesque** (display, variable): titles, shop names, buttons, and **every money figure and PIN**. It has the ₦ sign and tabular figures.
- **Instrument Sans** (body, variable): sentences, labels, forms. It lacks ₦, so a unicode-range font face borrows the ₦ glyph from Bricolage; naira signs in body copy stay in family.
- Scale (px): 12 / 14 / 16 / 18 / 22 / 28 / 36. Titles are tight (`-0.025em`), body is normal. Lines stay under 60 characters. Sentence case everywhere.

### Layout

Mobile-first, one column, left-aligned. Centred only for the order tracker and empty states.
Tab bar at the bottom per role. Lists are flat rows on the paper background (no stacks of identical rounded cards). Radii differ by job: buttons 14, inputs 12, shop signs 10, sheets 24 on top, chips fully round. No decorative shadows; only sheets lift.

```
Customer home            Order tracking              Checkout
+-----------------+      +-----------------+         +-----------------+
| Shops near you  |      |  <  ORB-261106  |         | Your basket     |
| [ search      ] |      |                 |         |  2 x Jollof ... |
| All Food Groc.. |      |      .-""-.     |         |                 |
|                 |      |    /   o    \   |         | How should it   |
| [M] Mama N...   |      |   |  On the  |  |         | reach you?      |
|     Food, 20min |      |   |   way    |  |         | ( ) Pick up     |
| [G] Gate 2 ...  |      |    \       /    |         | (o) ORBIT rider |
|                 |      |      '-..-'     |         | ( ) Shop brings |
| [tabs]          |      |  PIN  4 8 2 1   |         | [ Pay N7,100 ]  |
+-----------------+      +-----------------+         +-----------------+
```

### Principles

1. **One bold thing: the orbit.** The order tracker is a ring with a yellow satellite that moves to the next stop when the order advances. Everything else stays quiet so this lands.
2. **Structure carries information.** Stage markers exist only because the order really is a sequence. The PIN has a perforated edge because it is a stub you hand over. Nothing is numbered or ruled for decoration.
3. **Say what happens.** Buttons name the result ("Pay ₦7,100", "Mark ready"), and the same action keeps the same name through the flow. Errors say what went wrong and what to do; they do not apologise.
4. **Money and the PIN are the heroes of their screens.** Large, tabular, display face.
5. **Honest states.** Loading shows the shape of what is coming; empty screens give the next action; failures give a retry.

## Critique and revisions (what the first plan got wrong)

The first plan had five signature motifs: awning stripes on shop headers, ticket notches on merchant orders, a perforated PIN slip, the orbit ring, and a yellow dot on tabs. Reviewed against the brief and the "looks generated" checklist:

- Five motifs dilute each other, and awnings plus notches were decoration that carried no information. **Cut awnings and ticket notches.** Merchant orders became flat rows with a status bar on the left.
- A first sketch used the SaaS pattern of identical shadowed cards for KPIs. **Replaced with a typographic table** grouped by Marketplace, Logistics and Financial.
- A first sketch used spaced all-caps labels above sections. **Removed**; sentence-case headings only.
- Navy plus yellow can look stock on its own. What keeps it specific: the ring-and-satellite brand mark that is also the tracker, per-shop sign colours, and display-face money.

Kept deliberately: yellow primary buttons (the keke), a small yellow dot above the active tab (the satellite), and the perforated PIN stub (a functional metaphor).

## Motion

No entrance animations and no hover effects. Motion answers a person's action: the satellite travels to the next stop when an order advances, buttons press down 2%, sheets slide. `prefers-reduced-motion` turns all of it into instant changes.

## Accessibility floor

Touch targets at least 48px, visible focus rings, 16px minimum input text (no iOS zoom), status never conveyed by colour alone, contrast at least AA, dynamic text sizes respected (`rem` units).

## Not in the MVP

Dark mode, image uploads for products (shops use their sign colour and a monogram), localisation (English only, Nigerian conventions: ₦, +234 numbers, Lagos time).
