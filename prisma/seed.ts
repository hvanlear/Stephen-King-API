import { books } from "./bookData";
import { shorts } from "./shortsData";
import prisma from "../src/db";

async function main() {
  for (let book of books) {
    await prisma.book.create({
      data: book,
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
