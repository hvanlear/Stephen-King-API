import prisma from "../db";
import { createResponse } from '../utils/responseHelper';


const URL = process.env.URL || 'http://localhost:3001';

//get one book
export const getOneBook = async (req, res) => {
  try {
    const id = req.params.id;
    const book = await prisma.book.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        villains: {
          select: {
            villainId: true,
            villain: {
              select: {
                name: true
              }
            }
          },
        },
      },
    });
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    const response = createResponse(book, URL);
    res.json({ data: response });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the book' });
  }
};

// get all books
export const getBooks = async (req, res) => {
  try {
    const books = await prisma.book.findMany({
      include: {
        villains: {
          select: {
            villainId: true,
            villain: {
              select: {
                name: true
              }
            }
          },
        },
      },
    });
    const response = books.map(book => createResponse(book, URL));
    res.json({ data: response });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the books' });
  }
};


//Create a book
export const createABook = async (req, res, next) => {
  try {
    const book = await prisma.book.create({
      data: {
        Year: req.body.Year,
        Title: req.body.Title,
        handle: req.body.handle,
        Pages: req.body.Pages,
        Publisher: req.body.Publisher,
        ISBN: req.body.ISBN,
        Notes: req.body.Notes,
      },
    });
    res.json({ data: book });
  } catch (e) {
    e.type = "input";
    next(e);
  }
};
