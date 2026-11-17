-- AlterTable
ALTER TABLE "PatientProfile" ALTER COLUMN "cpfEnc" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpLastStep" INTEGER;
