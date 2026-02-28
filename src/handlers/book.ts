import prisma from "../db";
import { createResponse } from '../utils/responseHelper';

const villainInclude = {
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
};

//get one book
export const getOneBook = async (req, res) => {
  try {
    const id = req.params.id;
    const book = await prisma.book.findUnique({
      where: {
        id: Number(id),
      },
      include: villainInclude,
    });
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    const response = createResponse(book);
    res.json({ data: response });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the book' });
  }
};

// get all books
export const getBooks = async (req, res) => {
  try {
    const page = req.query.page ? Math.max(1, parseInt(req.query.page as string)) : null;
    const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit as string))) : null;
    const usePagination = page !== null && limit !== null;

    const books = await prisma.book.findMany({
      ...(usePagination && { skip: (page - 1) * limit, take: limit }),
      include: villainInclude,
    });

    const response = books.map(book => createResponse(book));

    if (usePagination) {
      const total = await prisma.book.count();
      res.json({
        data: response,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } else {
      res.json({ data: response });
    }
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
