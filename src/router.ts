import { Router } from "express";
import { getBooks, getOneBook } from "./handlers/book";
import { getShorts, getOneShort } from "./handlers/short";
import { getOneVillain, getVillains } from "./handlers/villains";
import { getOnePlace, getPlaces } from "./handlers/places";
import { getOneType, getTypes } from "./handlers/types";

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

//Places Router
router.get("/places", getPlaces);
router.get("/place/:id", getOnePlace);

//Types Router
router.get("/types", getTypes);
router.get("/type/:id", getOneType);

export default router;
