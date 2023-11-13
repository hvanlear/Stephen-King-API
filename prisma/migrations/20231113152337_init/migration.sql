/*
  Warnings:

  - You are about to drop the `Place` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Short` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Type` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_BookToVillain` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_BookToVillain" DROP CONSTRAINT "_BookToVillain_A_fkey";

-- DropForeignKey
ALTER TABLE "_BookToVillain" DROP CONSTRAINT "_BookToVillain_B_fkey";

-- DropTable
DROP TABLE "Place";

-- DropTable
DROP TABLE "Short";

-- DropTable
DROP TABLE "Type";

-- DropTable
DROP TABLE "_BookToVillain";

-- CreateTable
CREATE TABLE "bookVillains" (
    "book_id" INTEGER NOT NULL,
    "villain_id" INTEGER NOT NULL,

    CONSTRAINT "bookVillains_pkey" PRIMARY KEY ("book_id","villain_id")
);

-- AddForeignKey
ALTER TABLE "bookVillains" ADD CONSTRAINT "bookVillains_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookVillains" ADD CONSTRAINT "bookVillains_villain_id_fkey" FOREIGN KEY ("villain_id") REFERENCES "Villain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
