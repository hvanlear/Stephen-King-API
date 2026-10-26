import { Request } from "express";

// Paginates only when both page and limit are given; limit is capped at 100
export function listResponse<T>(items: T[], query: Request["query"]) {
  const page = query.page ? Math.max(1, parseInt(query.page as string)) : null;
  const limit = query.limit
    ? Math.min(100, Math.max(1, parseInt(query.limit as string)))
    : null;

  if (page === null || limit === null) {
    return { data: items };
  }

  return {
    data: items.slice((page - 1) * limit, page * limit),
    pagination: {
      page,
      limit,
      total: items.length,
      totalPages: Math.ceil(items.length / limit),
    },
  };
}
