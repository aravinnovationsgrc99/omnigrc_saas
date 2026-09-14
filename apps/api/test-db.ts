import { PrismaClient } from '@prisma/client';

async function testDatabase() {
  console.log('=== DATABASE CONNECTION VERIFICATION ===');
  console.log('DATABASE_URL from process.env:', process.env.DATABASE_URL);

  const prisma = new PrismaClient();

  try {
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log('Database Query Raw result:', result);

    const userCount = await prisma.user.count().catch(() => 0);
    const assetCount = await prisma.asset.count().catch(() => 0);
    const riskCount = await prisma.risk.count().catch(() => 0);
    const controlCount = await prisma.control.count().catch(() => 0);

    console.log(`Counts -> Users: ${userCount}, Assets: ${assetCount}, Risks: ${riskCount}, Controls: ${controlCount}`);
    console.log('\nVERIFICATION RESULT: PostgreSQL database is connected and active!');
  } catch (err: any) {
    console.error('\nVERIFICATION RESULT: PostgreSQL connection FAILED.');
    console.error('Error message:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
