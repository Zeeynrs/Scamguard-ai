export const ACCESS_CODE_STORAGE_KEY = "scamguard_access_code";

/** Fetch wrapper that attaches the optional demo access code to API requests. */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const accessCode =
    typeof window !== "undefined" ? window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY) : null;

  if (accessCode && !headers.has("X-Access-Code")) {
    headers.set("X-Access-Code", accessCode);
  }

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("access-code-required", { detail: { status: 401 } }));
  }
  return response;
}
