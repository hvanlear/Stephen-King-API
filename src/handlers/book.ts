import prisma from "../db";


//get one book
export const getOneBook = async (req,res) => {
    const id = req.params.id;

    const book = await prisma.book.findFirst({
        where: {
            id: Number(id)
        },
        include: {
            villains: {
                select: {
                    villainId: true,
                }
            }
        }
    });

    const response = {
        ...book,
        villains: book.villains.map(villain => (
            `http://localhost:5000/api/villain/${villain.villainId}`
        )),
    };

    res.json({ data: response });
}

//get all books
export const getBooks = async (req, res) => {
  const books = await prisma.book.findMany({
    include: {
      villains: {
        select: {
          villainId: true
        }
      }
    },
  });
//add url to villains
  const response = books.map(book => ({
    ...book,
    villains: book.villains.map(villain => (
       `http://localhost:5000/api/villain/${villain.villainId}`
    )),
  }));

  res.json({ data: response });

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
