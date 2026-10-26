-- CreateTable
CREATE TABLE "EndpointStat" (
    "endpoint" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "last_accessed" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndpointStat_pkey" PRIMARY KEY ("endpoint")
);

