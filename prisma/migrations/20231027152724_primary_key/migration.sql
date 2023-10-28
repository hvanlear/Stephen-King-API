/*
  Warnings:

  - The primary key for the `Book` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `isbn` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `pages` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `publisher` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `collected_in` on the `Short` table. All the data in the column will be lost.
  - You are about to drop the column `originally_published_in` on the `Short` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Short` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[Title]` on the table `Book` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ISBN]` on the table `Book` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ISBN` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Pages` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Publisher` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Title` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Year` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `collectedIn` to the `Short` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originallyPublishedIn` to the `Short` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Book_isbn_key";

-- DropIndex
DROP INDEX "Book_title_key";

-- AlterTable
ALTER TABLE "Book" DROP CONSTRAINT "Book_pkey",
DROP COLUMN "isbn",
DROP COLUMN "notes",
DROP COLUMN "pages",
DROP COLUMN "publisher",
DROP COLUMN "title",
DROP COLUMN "updated_at",
DROP COLUMN "year",
ADD COLUMN     "ISBN" TEXT NOT NULL,
ADD COLUMN     "Notes" TEXT[],
ADD COLUMN     "Pages" INTEGER NOT NULL,
ADD COLUMN     "Publisher" TEXT NOT NULL,
ADD COLUMN     "Title" TEXT NOT NULL,
ADD COLUMN     "Year" INTEGER NOT NULL,
ADD CONSTRAINT "Book_pkey" PRIMARY KEY ("handle");

-- AlterTable
ALTER TABLE "Short" DROP COLUMN "collected_in",
DROP COLUMN "originally_published_in",
DROP COLUMN "updated_at",
ADD COLUMN     "collectedIn" TEXT NOT NULL,
ADD COLUMN     "originallyPublishedIn" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Villain" (
    "id" SERIAL NOT NULL,
    "types_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "appears_in" TEXT[],
    "gender" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Villain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Type" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BookToVillain" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Villain_name_key" ON "Villain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Place_name_key" ON "Place"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Type_type_key" ON "Type"("type");

-- CreateIndex
CREATE UNIQUE INDEX "_BookToVillain_AB_unique" ON "_BookToVillain"("A", "B");

-- CreateIndex
CREATE INDEX "_BookToVillain_B_index" ON "_BookToVillain"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Book_Title_key" ON "Book"("Title");

-- CreateIndex
CREATE UNIQUE INDEX "Book_ISBN_key" ON "Book"("ISBN");

-- AddForeignKey
ALTER TABLE "_BookToVillain" ADD CONSTRAINT "_BookToVillain_A_fkey" FOREIGN KEY ("A") REFERENCES "Book"("handle") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookToVillain" ADD CONSTRAINT "_BookToVillain_B_fkey" FOREIGN KEY ("B") REFERENCES "Villain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
