-- CreateTable
CREATE TABLE "shortVillains" (
    "short_id" INTEGER NOT NULL,
    "villain_id" INTEGER NOT NULL,

    CONSTRAINT "shortVillains_pkey" PRIMARY KEY ("short_id","villain_id")
);

-- AddForeignKey
ALTER TABLE "shortVillains" ADD CONSTRAINT "shortVillains_short_id_fkey" FOREIGN KEY ("short_id") REFERENCES "Short"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortVillains" ADD CONSTRAINT "shortVillains_villain_id_fkey" FOREIGN KEY ("villain_id") REFERENCES "Villain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
