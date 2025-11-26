const envBackend =
  (typeof globalThis !== "undefined" &&
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.NEXT_PUBLIC_BACKEND_URL) ||
  undefined

export const BACKEND_API_URL = envBackend || "http://localhost:8000"


