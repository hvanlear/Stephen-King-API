// import { books } from "./bookData";
import { books } from "./bookData";
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
    villain.types_id = Number(villain.types_id);
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
