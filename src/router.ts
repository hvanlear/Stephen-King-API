import { Router } from "express";
import { body, oneOf, validationResult } from "express-validator";
import { handleInputErrors } from "./modules/middleware";
import { createABook } from "./handlers/book";

const router = Router();

// Books Router

router.get("/books", (req, res) => {
  res.json({ message: "hello" });
});
router.get("/books/:id", () => {});
router.put("/books/:id", () => {});
router.post("/books", handleInputErrors, createABook);
router.delete("/books", () => {});

//Shorts Router

router.get("/shorts", () => {});
router.get("/shorts/:id", () => {});
router.put("/shorts/:id", () => {});
router.post("/shorts", () => {});
router.delete("/shorts", () => {});

export default router;
