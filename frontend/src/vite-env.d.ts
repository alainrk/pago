/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

// Set by vite.config.ts at build time, see src/lib/version.ts.
declare const __BUILD_ID__: string;
