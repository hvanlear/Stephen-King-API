// Ids in URLs must be whole numbers; null means the request is malformed
export function parseId(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}
