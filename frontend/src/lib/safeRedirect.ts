/** Auth return destinations are paths on this site, never executable URLs. */
export function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  return value;
}
