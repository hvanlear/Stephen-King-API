import { Router } from "express";
import { body, oneOf, validationResult } from "express-validator";
import { handleInputErrors } from "./modules/middleware";
import { createABook, getBooks, getOneBook } from "./handlers/book";
import { getShorts, getOneShort } from "./handlers/short";
import { getOneVillain, getVillains } from "./handlers/villains";



const router = Router();

// Books Router
router.get("/books",getBooks);
router.get("/book/:id",getOneBook);
router.get("/book/:id/villains", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.put("/book/:id", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/books", handleInputErrors, createABook);
router.delete("/books", (req, res) => res.status(501).json({ message: "Not implemented" }));

//Shorts Router
router.get("/shorts", getShorts);
router.get("/short/:id", getOneShort);
router.get("/short/:id/villains", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.put("/short/:id", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/shorts", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.delete("/shorts", (req, res) => res.status(501).json({ message: "Not implemented" }));

//Villains Router
router.get("/villains", getVillains);
router.get("/villain/:id",getOneVillain);
router.put("/villain/:id", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.post("/villains", (req, res) => res.status(501).json({ message: "Not implemented" }));
router.delete("/villains", (req, res) => res.status(501).json({ message: "Not implemented" }));

export default router;
