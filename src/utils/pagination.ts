import { Request, Response } from "express";

type Query = Request["query"];

// undefined when absent, NaN when it isn't a whole number
function wholeNumber(value: Query[string]): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    return NaN;
  }
  return Number(value);
}

// Paginates only when both page and limit are given. Values out of range are
// clamped, as they always have been (page=0 is page 1, limit tops out at 100);
// anything that isn't a whole number is a 400.
export function sendList<T>(res: Response, items: T[], query: Query): void {
  const page = wholeNumber(query.page);
  const limit = wholeNumber(query.limit);

  if (Number.isNaN(page) || Number.isNaN(limit)) {
    res.status(400).json({ error: "page and limit must be whole numbers" });
    return;
  }

  if (page === undefined || limit === undefined) {
    res.json({ data: items });
    return;
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  res.json({
    data: items.slice((safePage - 1) * safeLimit, safePage * safeLimit),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: items.length,
      totalPages: Math.ceil(items.length / safeLimit),
    },
  });
}
