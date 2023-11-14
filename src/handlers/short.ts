import prisma from "../db";

const createResponse = (short) => ({
  ...short,
  villains: short.villains.map(villain => `http://localhost:5000/api/villain/${villain.villainId}`)
});

//get one short
export const getOneShort = async (req,res) => {
  try {
    const id = req.params.id;

    const short = await prisma.short.findFirst({
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
    const shorts = await prisma.short.findMany({
      include: {
        villains: {
          select: {
            villainId: true
          }
        }
      },
    });

    const response = shorts.map(short => createResponse(short));
    res.json({ data: response });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving the shorts' });
  }
};


