/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Address of the ORBIT API including /api, e.g. http://192.168.1.20:4000/api */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
