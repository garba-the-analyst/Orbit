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
  // Release builds talk to the API over https only. Set CAP_CLEARTEXT=true for a local, http-only API on a LAN.
  server: { androidScheme: 'https', cleartext: process.env.CAP_CLEARTEXT === 'true' },
  plugins: {
    Keyboard: { resize: 'body' },
    StatusBar: { style: 'DARK', backgroundColor: '#F4F5F9' },
    SplashScreen: { launchShowDuration: 0 },
  },
};

export default config;
