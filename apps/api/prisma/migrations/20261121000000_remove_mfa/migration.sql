-- DropForeignKey
ALTER TABLE "RecoveryCode" DROP CONSTRAINT "RecoveryCode_userId_fkey";

-- DropTable
DROP TABLE "RecoveryCode";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "mfaPassed";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "totpEnabledAt",
DROP COLUMN "totpLastStep",
DROP COLUMN "totpSecretEnc";
