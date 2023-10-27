import prisma from "../db";

//get all books
export const getBooks = async (req, res) => {
  const books = await prisma.book.findMany();

  res.json({ data: books });
};

//Create a book
export const createABook = async (req, res) => {
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
};
