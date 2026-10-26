import { Request, Response, NextFunction } from "express";
import { recordHit } from "../analytics/store";

export function trackApiHits(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.on("finish", () => {
    if (req.route) {
      const routeKey = `${req.method} /api${req.route.path}`;
      recordHit(routeKey);
    }
  });
  next();
}
