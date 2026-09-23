import type { FastifyPluginAsync } from 'fastify';
import { ProfileSlug, prisma } from '@alexa-finances/database';

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/profiles', async () => {
    const profiles = await prisma.profile.findMany({
      where: { slug: { in: [ProfileSlug.BIANCA, ProfileSlug.SERGIO] } },
      orderBy: { displayName: 'asc' },
    });

    return { data: profiles.map((profile) => ({
      id: profile.id,
      slug: profile.slug.toLowerCase(),
      displayName: profile.displayName,
    })) };
  });
};
