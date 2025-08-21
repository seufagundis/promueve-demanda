-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('cliente', 'abogado');

-- CreateEnum
CREATE TYPE "public"."TimelineTipo" AS ENUM ('ok', 'warn', 'info');

-- CreateTable
CREATE TABLE "public"."app_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."consultas" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "consentimiento" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reclamos" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "monto" DECIMAL(14,2),
    "estado" TEXT NOT NULL DEFAULT 'En trámite',
    "tipo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sla_due" TIMESTAMPTZ(6),

    CONSTRAINT "reclamos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reclamo_timeline" (
    "id" UUID NOT NULL,
    "reclamo_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "hito" TEXT NOT NULL,
    "tipo" "public"."TimelineTipo",

    CONSTRAINT "reclamo_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reclamo_mensajes" (
    "id" UUID NOT NULL,
    "reclamo_id" UUID NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reclamo_mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reclamo_archivos" (
    "id" UUID NOT NULL,
    "reclamo_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "originalname" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,

    CONSTRAINT "reclamo_archivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "public"."app_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "reclamos_codigo_key" ON "public"."reclamos"("codigo");

-- CreateIndex
CREATE INDEX "idx_reclamos_owner" ON "public"."reclamos"("owner_email");

-- CreateIndex
CREATE INDEX "idx_reclamos_estado" ON "public"."reclamos"("estado");

-- AddForeignKey
ALTER TABLE "public"."reclamo_timeline" ADD CONSTRAINT "reclamo_timeline_reclamo_id_fkey" FOREIGN KEY ("reclamo_id") REFERENCES "public"."reclamos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reclamo_mensajes" ADD CONSTRAINT "reclamo_mensajes_reclamo_id_fkey" FOREIGN KEY ("reclamo_id") REFERENCES "public"."reclamos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reclamo_archivos" ADD CONSTRAINT "reclamo_archivos_reclamo_id_fkey" FOREIGN KEY ("reclamo_id") REFERENCES "public"."reclamos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
