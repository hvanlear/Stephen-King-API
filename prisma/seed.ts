// import { books } from "./bookData";
import { books } from "./bData";
import { shorts } from "./shortsData";
import { villains } from "./vData";
import prisma from "../src/db";

async function main() {
  for (let book of books) {
    await prisma.book.create({
      data: book,
    });
  }

  for (let short of shorts) {
    await prisma.short.create({
      data: short,
    });
  }

  for(let villain of villains) {
    await prisma.villain.create({
      data: villain,
    });
  }
}


main()
  .catch((e) => {
    console.log(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
