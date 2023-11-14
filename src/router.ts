import { Router } from "express";
import { body, oneOf, validationResult } from "express-validator";
import { handleInputErrors } from "./modules/middleware";
import { createABook, getBooks, getOneBook } from "./handlers/book";
import { getShorts } from "./handlers/short";
import { getOneVillain } from "./handlers/villains";


const router = Router();

// Books Router
router.get("/books",getBooks);
router.get("/book/:id",getOneBook);
router.get("/book/:id/villains", () => {});
router.put("/book/:id", () => {});
router.post("/books", handleInputErrors, createABook);
router.delete("/books", () => {});

//Shorts Router
router.get("/shorts", handleInputErrors, getShorts);
router.get("/short/:id", () => {});
router.get("/short/:id/villains", () => {});
router.put("/short/:id", () => {});
router.post("/shorts", () => {});
router.delete("/shorts", () => {});

//Villains Router
router.get("/villains", handleInputErrors, getShorts);
router.get("/villain/:id",getOneVillain);
router.put("/villain/:id", () => {});
router.post("/villains", () => {});
router.delete("/villains", () => {});

export default router;
