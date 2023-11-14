import prisma from '../db';
const URL = process.env.URL || 'http://localhost:3001';

const createResponse = (villain) => ( {
    ...villain,
    books: villain.books.map(book => `${URL}/api/book/${book.bookId}`),
    shorts: villain.shorts.map(short => `${URL}/api/short/${short.shortId}`),
})

export const getOneVillain = async (req, res) => {
  try {
    const id = req.params.id;

    const villain = await prisma.villain.findFirst({
      where: {
        id: Number(id)
      },
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

    if (!villain) {
      return res.status(404).json({ error: 'Villain not found' });
    }

    const response = createResponse(villain);
    res.json({ data: response });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the villain' });
  }
};

export const getVillains = async (req,res) => {
  try {
    const villains = await prisma.villain.findMany({
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

    const response = villains.map(villain => createResponse(villain));
    res.json({data: response});
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the villains' });
  }
};