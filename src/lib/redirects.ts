/** Only in-app destinations may be carried through the login/profile flow. */
export function isSafeNext(next: string): boolean {
  return next.startsWith("/join/") || next === "/delete-account";
}

export function safeNext(next: string | null | undefined, fallback = "/"): string {
  return next && isSafeNext(next) ? next : fallback;
}

export function withParam(url: string, key: string, value: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}
