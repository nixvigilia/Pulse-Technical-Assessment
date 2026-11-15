// Tab-only session secret. Stored in memory on the client; never put in poll URLs.
export function generateSessionSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Browser-only: Next's Buffer polyfill does not implement base64url encoding.
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}