import { Request, Response, NextFunction } from "express";
import { recordHit } from "../analytics/store";

export function trackApiHits(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.on("finish", () => {
    if (req.route) {
      // The mount path plus the route pattern, such as "GET /api/book/:id"
      const routeKey = `${req.method} ${req.baseUrl}${req.route.path}`;
      recordHit(routeKey);
    }
  });
  next();
}
