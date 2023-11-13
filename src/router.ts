import { Router } from "express";
import { body, oneOf, validationResult } from "express-validator";
import { handleInputErrors } from "./modules/middleware";
import { createABook } from "./handlers/book";
import { getShorts } from "./handlers/short";

const router = Router();

// Books Router

router.get("/books", (req, res) => {
  res.json({ message: "hello" });
});
router.get("/books/:id", () => {});
router.get("/books/:id/villains", () => {});
router.put("/books/:id", () => {});
router.post("/books", handleInputErrors, createABook);
router.delete("/books", () => {});

//Shorts Router

router.get("/shorts", handleInputErrors, getShorts);
router.get("/shorts/:id", () => {});
router.get("/shorts/:id/villains", () => {});
router.put("/shorts/:id", () => {});
router.post("/shorts", () => {});
router.delete("/shorts", () => {});
//Villains Router

router.get("/villains", handleInputErrors, getShorts);
router.get("/villains/:id", () => {});
router.put("/villains/:id", () => {});
router.post("/villains", () => {});
router.delete("/villains", () => {});

export default router;
