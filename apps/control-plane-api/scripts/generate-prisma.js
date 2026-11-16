const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Generate Control Plane Client (@prisma/control-plane-client)
const controlPlaneSchemas = [
  path.join(__dirname, '..', 'prisma', 'schema.prisma'),
  path.join(process.cwd(), 'prisma', 'schema.prisma'),
  path.join(process.cwd(), 'apps', 'control-plane-api', 'prisma', 'schema.prisma'),
];

const controlSchema = controlPlaneSchemas.find((p) => fs.existsSync(p));
if (controlSchema) {
  console.log(`[generate-prisma] Generating Control Plane client from ${controlSchema}...`);
  try {
    execSync(`npx prisma generate --schema="${controlSchema}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('[generate-prisma] Error generating Control Plane client:', err.message);
    process.exit(1);
  }
} else {
  console.error('[generate-prisma] Error: Could not find control-plane schema.prisma');
  process.exit(1);
}

// 2. Generate Data Plane Client (@prisma/client - needed by DataPlanePrismaService)
const dataPlaneSchemas = [
  path.join(__dirname, '..', '..', 'api', 'prisma', 'schema.prisma'),
  path.join(process.cwd(), '..', 'api', 'prisma', 'schema.prisma'),
  path.join(process.cwd(), 'apps', 'api', 'prisma', 'schema.prisma'),
];

const dataSchema = dataPlaneSchemas.find((p) => fs.existsSync(p));
if (dataSchema) {
  console.log(`[generate-prisma] Generating Data Plane client from ${dataSchema}...`);
  try {
    execSync(`npx prisma generate --schema="${dataSchema}"`, { stdio: 'inherit' });
  } catch (err) {
    console.warn('[generate-prisma] Non-fatal: Failed to generate data plane client:', err.message);
  }
} else {
  console.warn('[generate-prisma] Warning: Could not find data-plane schema.prisma at any expected location.');
}
