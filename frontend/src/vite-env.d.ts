/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // See src/lib/domains.ts for these four.
  readonly VITE_API_URL_BY_HOST?: string;
  readonly VITE_MOVED_FROM_HOSTS?: string;
  readonly VITE_MOVED_TO_URL?: string;
  readonly VITE_MOVED_BY_DATE?: string;
}
