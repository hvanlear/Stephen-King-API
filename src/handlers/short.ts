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
    }
  }
};

//get one short
export const getOneShort = async (req,res) => {
  try {
    const id = req.params.id;
    const short = await prisma.short.findUnique({
        where: {
            id: Number(id)
        },
        include: villainInclude,
    });

    if (!short) {
      return res.status(404).json({ error: 'Short not found' });
    }
    const response = createResponse(short);
    res.json({ data: response });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the short' });
  }
}

//get all shorts
export const getShorts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [shorts, total] = await Promise.all([
      prisma.short.findMany({
        skip,
        take: limit,
        include: villainInclude,
      }),
      prisma.short.count(),
    ]);

    const response = shorts.map(short => createResponse(short));
    res.json({
      data: response,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the shorts' });
  }
};
