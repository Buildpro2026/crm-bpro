// Only same-site relative paths may follow sign-in. Anything else falls back
// to the companies list, which blocks open redirects through ?next=.
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/companies";
  }
  return value;
}
