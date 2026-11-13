/**
 * Demo mode. Built with VITE_DEMO=true, the app runs entirely on this device against a built-in fake backend
 * (see server.ts): no server, no database, no internet needed, nothing leaves the phone. It exists so testers can
 * walk through every role and workflow. Real builds leave it off and talk to the real API.
 */
export const DEMO = import.meta.env.VITE_DEMO === 'true';
