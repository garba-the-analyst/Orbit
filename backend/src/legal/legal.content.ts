/** The terms and privacy notice shown at sign-up. Plain language; have them reviewed by a lawyer before a public launch. */
export const LEGAL_VERSION = process.env.TERMS_VERSION ?? '2026-11-pilot';

export const LEGAL = {
  version: LEGAL_VERSION,
  title: 'ORBIT pilot: terms and privacy',
  pilotNotice:
    'ORBIT is in a supervised pilot. Payments are in TEST MODE: no real money moves, and nothing you buy or sell here is a real sale. Orders, trips and deliveries are for testing the platform.',
  terms: [
    'You must be 18 or older, or have a parent or guardian’s permission, to use ORBIT.',
    'Give true information. Do not share your password. You are responsible for what happens in your account.',
    'Merchants must list real goods and services and describe them honestly. Drivers must hold the licence and papers the law requires for their vehicle, and must drive safely.',
    'Do not use ORBIT to carry anything illegal or dangerous, to harass anyone, or to cheat the platform (for example fake trips or fake reviews).',
    'During the pilot, prices, fees, fares and payouts are for testing. ORBIT may reset test data, suspend accounts that break these terms, and change the app at any time.',
    'ORBIT is a project of its student team. It is provided as is, without any guarantee, while it is being tested.',
  ],
  privacy: [
    'What we collect: your name, email, phone number, saved addresses, the orders and trips you make, your location while you use ride and delivery features (drivers: while online), ratings, and, for merchants and drivers, the documents you upload for verification.',
    'Why: to run the service (match you with drivers and shops, show a driver’s position to the customer they are serving, settle earnings), to keep people safe (verification, PINs, safety alerts) and to prevent fraud.',
    'Who sees it: shops, drivers and customers only see what a delivery or ride needs (for example a first name and a phone number while a trip is under way). ORBIT staff can see what they need to verify accounts and handle problems; their actions are logged. Verification documents are private and are only seen by ORBIT staff.',
    'Sharing a trip gives the link holder the driver’s first name, vehicle, plate and live position until two hours after the trip. You can stop sharing at any time.',
    'Your choices: you can download a copy of your data and delete your account from the Profile screen. Deleting removes your personal details and documents; records of past orders and trips are kept without your name for accounting.',
    'Questions or requests: contact the ORBIT team through the support address shown in the app.',
  ],
};
