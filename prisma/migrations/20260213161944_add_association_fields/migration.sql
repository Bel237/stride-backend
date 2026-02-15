-- AlterTable
ALTER TABLE "associations" ADD COLUMN     "baseContribution" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contributionFrequency" TEXT DEFAULT 'monthly',
ADD COLUMN     "currency" TEXT DEFAULT 'XAF',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "estimatedMembers" INTEGER,
ADD COLUMN     "firstMeetingDate" TIMESTAMP(3),
ADD COLUMN     "region" TEXT,
ADD COLUMN     "type" TEXT;
