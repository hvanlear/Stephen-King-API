import { Router } from "express";
import { kinds } from "./kinds";
import { kindHandlers } from "./handlers/kind";

const router = Router();

// The dashboard counts hits by these patterns, such as "GET /api/book/:id",
// so changing one starts that route's count over
for (const kind of kinds) {
  const { getList, getOne } = kindHandlers(kind);
  router.get(`/${kind.list}`, getList);
  router.get(`/${kind.one}/:id`, getOne);
}

export default router;
