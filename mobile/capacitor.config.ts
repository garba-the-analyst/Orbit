import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web app (dist/) as a native Android/iOS app.
 * See README.md for building the APK. For a real device, set VITE_API_URL to your API's address
 * before building (e.g. VITE_API_URL=http://192.168.1.20:4000/api), because "localhost" on a phone is the phone.
 */
const config: CapacitorConfig = {
  appId: 'ng.orbit.app',
  appName: 'ORBIT',
  webDir: 'dist',
  server: { androidScheme: 'http', cleartext: true }, // allows the dev API over http; remove for production (use https)
  plugins: {
    Keyboard: { resize: 'body' },
    StatusBar: { style: 'DARK', backgroundColor: '#F4F5F9' },
  },
};

export default config;
