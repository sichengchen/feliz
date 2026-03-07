export function wrapForNonRoot(
  cmd: string[],
  uid: number = process.getuid?.() ?? 1000
): string[] {
  if (uid === 0) {
    return ["gosu", "feliz", ...cmd];
  }
  return cmd;
}
