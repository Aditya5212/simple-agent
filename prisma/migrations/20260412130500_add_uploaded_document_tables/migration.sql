-- CreateEnum
CREATE TYPE "UploadedDocumentStatus" AS ENUM ('queued', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "IngestionJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "IngestionJobPhase" AS ENUM ('upload', 'parse', 'chunk', 'embed', 'index');

-- CreateTable
CREATE TABLE "UploadedDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "checksum" TEXT,
    "status" "UploadedDocumentStatus" NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "IngestionJobStatus" NOT NULL DEFAULT 'queued',
    "phase" "IngestionJobPhase" NOT NULL DEFAULT 'upload',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadedDocument_r2Key_key" ON "UploadedDocument"("r2Key");

-- CreateIndex
CREATE INDEX "UploadedDocument_userId_createdAt_idx" ON "UploadedDocument"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadedDocument_sessionId_createdAt_idx" ON "UploadedDocument"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadedDocument_status_createdAt_idx" ON "UploadedDocument"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionJob_documentId_createdAt_idx" ON "IngestionJob"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionJob_userId_status_createdAt_idx" ON "IngestionJob"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
