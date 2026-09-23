import { createPrismaClient } from '../src/client.js';
import { removeDemoData } from './demo-data.js';

if (process.env.CONFIRM_DEMO_RESET !== 'clear-demo-data') {
  throw new Error('Set CONFIRM_DEMO_RESET=clear-demo-data to remove demo records. Real records are never targeted.');
}

const prisma = createPrismaClient();

try {
  await removeDemoData(prisma);
} finally {
  await prisma.$disconnect();
}
