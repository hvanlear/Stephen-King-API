import prisma from "../db";

export const getShorts = async (req, res) => {
  const shorts = await prisma.short.findMany();

  res.json({ data: shorts });
};
