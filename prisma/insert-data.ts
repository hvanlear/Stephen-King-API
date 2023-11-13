// npx ts-node prisma/insert-data.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const main = async () => {
  const books = await prisma.book.findMany();
  const shorts = await prisma.short.findMany();
  const villains = await prisma.villain.findMany();
// console.log(books)

  
 
for (let i = 0; i < villains.length; i++) {
    for (let j = 0; j < villains[i].appears_in.length; j++) {
        // console.log(villains[i].appears_in[j])
        const book = books.find(book => book.handle === villains[i].appears_in[j])
        if(book){
            const bookVillain = await prisma.bookVillains.create({
                data: {
                    bookId: book.id,
                    villainId: villains[i].id
                }
            })
        }
    }
}
  
  for (let i = 0; i < villains.length; i++) {
    for (let j = 0; j < villains[i].appears_in.length; j++) {
      
        const short = shorts.find(short => short.handle === villains[i].appears_in[j])
        console.log(short)
        if(short){
            const shortVillain = await prisma.shortVillains.create({
                data: {
                    shortId: short.id,
                    villainId: villains[i].id
                }
            })
        }
    }
  }
}


main()

