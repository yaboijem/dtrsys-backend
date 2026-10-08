/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_API_PROXY?: string;
  readonly VITE_HTTPS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
