export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    androidScheme?: 'https' | 'http';
    cleartext?: boolean;
  };
  plugins?: {
    SplashScreen?: {
      launchShowDuration?: number;
      backgroundColor?: string;
      showSpinner?: boolean;
    };
  };
}

const config: CapacitorConfig = {
  appId: 'com.mixy.social',
  appName: 'MIXY',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#07070D',
      showSpinner: false,
    },
  },
};

export default config;
