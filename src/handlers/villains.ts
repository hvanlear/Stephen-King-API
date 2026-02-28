import prisma from '../db';
import { createResponse } from '../utils/responseHelper';

const villainSelect = {
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
};

export const getOneVillain = async (req, res) => {
  try {
    const id = req.params.id;

    const villain = await prisma.villain.findUnique({
      where: {
        id: Number(id)
      },
      select: villainSelect,
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
    const page = req.query.page ? Math.max(1, parseInt(req.query.page as string)) : null;
    const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit as string))) : null;
    const usePagination = page !== null && limit !== null;

    const villains = await prisma.villain.findMany({
      ...(usePagination && { skip: (page - 1) * limit, take: limit }),
      select: villainSelect,
    });

    const response = villains.map(villain => createResponse(villain));

    if (usePagination) {
      const total = await prisma.villain.count();
      res.json({
        data: response,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } else {
      res.json({ data: response });
    }
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the villains' });
  }
};
