import prisma from '../db';
import { createResponse } from '../utils/responseHelper';
const URL = process.env.URL || 'http://localhost:3001';

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
            book: {
              select: {
                Title: true
              }
            }
          }
        },
        shorts: {
          select: {
            shortId: true,
            short: {
              select: {
                title: true
              }
            }
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
            book: {
              select: {
                Title: true
              }
            }
          }
        },
        shorts: {
          select: {
            shortId: true,
            short: {
              select: {
                title: true
              }
            }
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