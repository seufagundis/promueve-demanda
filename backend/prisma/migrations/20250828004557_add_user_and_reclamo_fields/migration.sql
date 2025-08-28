-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "dni" VARCHAR(15),
ADD COLUMN     "telefono" VARCHAR(20);

-- AlterTable
ALTER TABLE "reclamos" ADD COLUMN     "dni" VARCHAR(15),
ADD COLUMN     "fecha_incidente" TIMESTAMPTZ(6),
ADD COLUMN     "telefono" VARCHAR(20);
