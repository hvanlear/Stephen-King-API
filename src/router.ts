import { Router } from "express";
import { getBooks, getOneBook } from "./handlers/book";
import { getShorts, getOneShort } from "./handlers/short";
import { getOneVillain, getVillains } from "./handlers/villains";

const router = Router();

// Books Router
router.get("/books", getBooks);
router.get("/book/:id", getOneBook);

//Shorts Router
router.get("/shorts", getShorts);
router.get("/short/:id", getOneShort);

//Villains Router
router.get("/villains", getVillains);
router.get("/villain/:id", getOneVillain);

export default router;
