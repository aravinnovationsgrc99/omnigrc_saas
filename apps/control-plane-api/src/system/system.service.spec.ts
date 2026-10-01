import { Test, TestingModule } from '@nestjs/testing';
import { ControlPlaneSystemService } from './system.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { LicenseSigningService } from '../licenses/license-signing.service';
import { DEV_LICENSE_PUBLIC_KEY } from '@omnigrc/shared';

describe('ControlPlaneSystemService', () => {
  let service: ControlPlaneSystemService;
  let prismaService: jest.Mocked<any>;
  let licenseSigningService: jest.Mocked<any>;

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn(),
    };

    licenseSigningService = {
      getKeyId: jest.fn().mockReturnValue('arav-license-v1-2026'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlPlaneSystemService,
        { provide: ControlPlanePrismaService, useValue: prismaService },
        { provide: LicenseSigningService, useValue: licenseSigningService },
      ],
    }).compile();

    service = module.get<ControlPlaneSystemService>(ControlPlaneSystemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSystemOverview', () => {
    it('should return derived system overview metadata with zero secret leakage', async () => {
      prismaService.$queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }]) // SELECT 1
        .mockResolvedValueOnce([{ migration_name: '20261001000000_add_cp_platform_announcements' }])
        .mockResolvedValueOnce([{ count: 11 }]);

      const overview = await service.getSystemOverview();

      expect(overview.version).toEqual('1.0.0');
      expect(overview.databaseMigrationCount).toBeGreaterThanOrEqual(1);
      expect(overview.health.database.status).toEqual('healthy');

      // Verify zero secret leakage
      const rawJson = JSON.stringify(overview);
      expect(rawJson).not.toContain('postgresql://');
      expect(rawJson).not.toContain('re_');
      expect(rawJson).not.toContain('secret');
      expect(rawJson).not.toContain('private');
      expect(rawJson).not.toContain('key');
    });
  });

  describe('getKeyRegistry', () => {
    it('should return derived cryptographic key metadata without private key material when key is set', async () => {
      process.env.LICENSE_VERIFICATION_PUBLIC_KEY = DEV_LICENSE_PUBLIC_KEY;
      const keyRegistry = await service.getKeyRegistry();

      expect(keyRegistry.keyId).toEqual('arav-license-v1-2026');
      expect(keyRegistry.algorithm).toEqual('Ed25519');
      expect(keyRegistry.purpose).toEqual('LICENSE_ARTIFACT_SIGNING');
      expect(keyRegistry.status).toEqual('ACTIVE');
      expect(keyRegistry.publicKeyFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Verify zero secret leakage
      const rawJson = JSON.stringify(keyRegistry);
      expect(rawJson).not.toContain('PRIVATE KEY');
      expect(rawJson).not.toContain('-----BEGIN');
      expect(rawJson).not.toContain('postgresql://');
      expect(rawJson).not.toContain('password');
    });

    it('should return empty fingerprint prefix when LICENSE_VERIFICATION_PUBLIC_KEY is not set', async () => {
      delete process.env.LICENSE_VERIFICATION_PUBLIC_KEY;
      const keyRegistry = await service.getKeyRegistry();
      expect(keyRegistry.publicKeyFingerprint).toEqual('sha256:');
    });
  });
});
