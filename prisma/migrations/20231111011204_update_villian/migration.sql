/*
  Warnings:

  - The primary key for the `Book` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `A` on the `_BookToVillain` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "_BookToVillain" DROP CONSTRAINT "_BookToVillain_A_fkey";

-- AlterTable
ALTER TABLE "Book" DROP CONSTRAINT "Book_pkey",
ADD CONSTRAINT "Book_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Villain" ADD COLUMN     "notes" TEXT[];

-- AlterTable
ALTER TABLE "_BookToVillain" DROP COLUMN "A",
ADD COLUMN     "A" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "_BookToVillain_AB_unique" ON "_BookToVillain"("A", "B");

-- AddForeignKey
ALTER TABLE "_BookToVillain" ADD CONSTRAINT "_BookToVillain_A_fkey" FOREIGN KEY ("A") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
