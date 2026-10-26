import { Request, Response } from "express";
import { books } from "../catalog";
import { bookResponse } from "../utils/responseHelper";
import { listResponse } from "../utils/pagination";

// The catalog never changes while the server runs, so build responses once
const responses = books.map(bookResponse);
const responsesById = new Map(responses.map((book) => [book.id, book]));

//get one book
export const getOneBook = (req: Request, res: Response) => {
  const book = responsesById.get(Number(req.params.id));
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  res.json({ data: book });
};

// get all books
export const getBooks = (req: Request, res: Response) => {
  res.json(listResponse(responses, req.query));
};
