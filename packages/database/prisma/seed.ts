import { ProfileSlug } from '@prisma/client';
import { createPrismaClient } from '../src/client.js';

const prisma = createPrismaClient();

async function main() {
  await prisma.profile.upsert({
    where: { slug: ProfileSlug.BIANCA },
    update: { displayName: 'Bianca' },
    create: { slug: ProfileSlug.BIANCA, displayName: 'Bianca' },
  });

  await prisma.profile.upsert({
    where: { slug: ProfileSlug.SERGIO },
    update: { displayName: 'Sergio' },
    create: { slug: ProfileSlug.SERGIO, displayName: 'Sergio' },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
