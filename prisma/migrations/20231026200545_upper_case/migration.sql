/*
  Warnings:

  - You are about to drop the column `isbn` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `pages` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `Book` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Short` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[Title]` on the table `Book` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ISBN]` on the table `Book` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ISBN` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Pages` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Title` to the `Book` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Year` to the `Book` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Book_isbn_key";

-- DropIndex
DROP INDEX "Book_title_key";

-- AlterTable
ALTER TABLE "Book" DROP COLUMN "isbn",
DROP COLUMN "notes",
DROP COLUMN "pages",
DROP COLUMN "title",
DROP COLUMN "updated_at",
DROP COLUMN "year",
ADD COLUMN     "ISBN" TEXT NOT NULL,
ADD COLUMN     "Notes" TEXT[],
ADD COLUMN     "Pages" INTEGER NOT NULL,
ADD COLUMN     "Title" TEXT NOT NULL,
ADD COLUMN     "Year" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Short" DROP COLUMN "updated_at";

-- CreateIndex
CREATE UNIQUE INDEX "Book_Title_key" ON "Book"("Title");

-- CreateIndex
CREATE UNIQUE INDEX "Book_ISBN_key" ON "Book"("ISBN");
