import { Request, Response } from "express";
import { books } from "../catalog";
import { bookResponse } from "../utils/responseHelper";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The catalog never changes while the server runs, so build responses once
const responses = books.map(bookResponse);
const responsesById = new Map(responses.map((book) => [book.id, book]));

//get one book
export const getOneBook = (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Book id must be a whole number" });
  }
  const book = responsesById.get(id);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  res.json({ data: book });
};

// get all books
export const getBooks = (req: Request, res: Response) => {
  sendList(res, responses, req.query);
};
