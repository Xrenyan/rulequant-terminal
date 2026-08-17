export function paginateItems<T>(items: T[], requestedPage: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), pageCount - 1);
  const offset = page * safePageSize;

  return {
    items: items.slice(offset, offset + safePageSize),
    page,
    pageCount,
    start: items.length ? offset + 1 : 0,
    end: Math.min(offset + safePageSize, items.length),
  };
}
