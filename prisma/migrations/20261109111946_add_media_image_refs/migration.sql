-- AlterTable
ALTER TABLE "Farm" ADD COLUMN "pendingGalleryRefs" TEXT;
ALTER TABLE "Farm" ADD COLUMN "pendingHeroImageRef" TEXT;

-- AlterTable
ALTER TABLE "FarmProductOffer" ADD COLUMN "imageRef" TEXT;
ALTER TABLE "FarmProductOffer" ADD COLUMN "pendingImageRef" TEXT;
