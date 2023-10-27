/*
  Warnings:

  - You are about to drop the column `collected_in` on the `Short` table. All the data in the column will be lost.
  - You are about to drop the column `originally_published_in` on the `Short` table. All the data in the column will be lost.
  - Added the required column `collectedIn` to the `Short` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originallyPublishedIn` to the `Short` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Short" DROP COLUMN "collected_in",
DROP COLUMN "originally_published_in",
ADD COLUMN     "collectedIn" TEXT NOT NULL,
ADD COLUMN     "originallyPublishedIn" TEXT NOT NULL;
