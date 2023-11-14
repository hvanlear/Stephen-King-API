import prisma from '../db';

export const getOneVillain = async (req, res) => {
    const id = req.params.id;
  
    const villain = await prisma.villain.findFirst({
      where: {
        id: Number(id)
      },
      //this removes the appears_in column from the response as it's included in the shorts and/or books column
      select: {
        id: true,
        name: true,
        gender: true,
        status: true,
        types_id: true,
        notes: true,
        created_at: true,
        books: {
          select: {
            bookId: true,
          }
        },
        shorts: {
          select: {
            shortId: true,
          }
        }
      }
    });
  
    const response = {
      ...villain,
        books: villain.books.map(book => (
            `http://localhost:5000/api/book/${book.bookId}`
        )),
    };
  
    res.json({ data: response });
  };