-- CreateTable
CREATE TABLE "origin_brew_profiles" (
    "id" SERIAL NOT NULL,
    "origin" TEXT NOT NULL,
    "roast_level" TEXT NOT NULL,
    "brewing_method_id" INTEGER NOT NULL,
    "water_temp_c" INTEGER NOT NULL,
    "ratio" DOUBLE PRECISION NOT NULL,
    "brew_time_s" INTEGER NOT NULL,
    "grind_size" TEXT NOT NULL,
    "tasting_notes" TEXT NOT NULL,
    "technique" JSONB,
    "source" TEXT NOT NULL DEFAULT 'llm_generated',
    "confident" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified" TIMESTAMPTZ(3),

    CONSTRAINT "origin_brew_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "origin_brew_profiles_origin_roast_level_brewing_method_id_key" ON "origin_brew_profiles"("origin", "roast_level", "brewing_method_id");
