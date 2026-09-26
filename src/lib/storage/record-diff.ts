/** Compare persisted records without clearing whole object stores. */
export function diffRecords<T>(before: readonly T[], after: readonly T[], key: (item: T) => string) {
  const previous = new Map(before.map((item) => [key(item), item]));
  const incoming = new Set(after.map(key));
  return {
    removed: [...previous.keys()].filter((id) => !incoming.has(id)),
    changed: after.filter((item) => JSON.stringify(previous.get(key(item))) !== JSON.stringify(item)),
  };
}
