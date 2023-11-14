import prisma from "../db";

const createResponse = (short) => ({
  ...short,
  villains: short.villains.map(villain => `http://localhost:5000/api/villain/${villain.villainId}`)
});

//get one short
export const getOneShort = async (req,res) => {
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

 const response = createResponse(short);

  res.json({ data: response });
}

//get all shorts
export const getShorts = async (req, res) => {
const shorts = await prisma.short.findMany({
  include: {
    villains: {
      select: {
        villainId: true
      }
    }
  },
});
//add url to villains
const response = shorts.map(short => createResponse(short));

res.json({ data: response });

};



