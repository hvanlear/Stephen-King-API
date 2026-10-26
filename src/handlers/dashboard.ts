import { Request, Response, NextFunction } from "express";
import { getStats } from "../analytics/store";
import { clearSession, dashboardEnabled } from "../modules/dashboardAuth";

export function showLogin(req: Request, res: Response): void {
  res.render("dashboard-login", {
    error: dashboardEnabled()
      ? null
      : "The dashboard isn't configured on this server.",
  });
}

export async function showDashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getStats();

    // Sort endpoints by hit count descending
    const sortedEndpoints = Object.entries(stats.endpoints)
      .map(([endpoint, data]) => ({
        endpoint,
        hits: data.hits,
        lastAccessed: data.lastAccessed,
      }))
      .sort((a, b) => b.hits - a.hits);

    // Compute uptime
    const startedAt = new Date(stats.startedAt);
    const now = new Date();
    const diffMs = now.getTime() - startedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const uptime = `${diffDays}d ${diffHours}h ${diffMinutes}m`;

    res.render("dashboard", {
      totalHits: stats.totalHits,
      endpointCount: Object.keys(stats.endpoints).length,
      uptime,
      endpoints: sortedEndpoints,
    });
  } catch (error) {
    console.error("Failed to load dashboard stats:", error);
    next(error);
  }
}

export function handleLogout(req: Request, res: Response): void {
  clearSession(res);
  res.redirect("/dashboard/login");
}
