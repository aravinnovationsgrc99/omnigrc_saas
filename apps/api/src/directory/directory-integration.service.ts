import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { DirectoryCryptoUtil } from './directory-crypto.util';
import { DirectoryGraphClient } from './directory-graph.client';
import {
  DirectoryIntegrationConfigDto,
  DirectoryGroupMappingDto,
  DirectorySyncLogDto,
  DirectoryTestConnectionResultDto,
  PaginatedDirectorySyncLogsDto,
  Role,
  ProductAccessStatus,
  DirectorySyncStatus,
  DirectoryProvider,
  DirectorySyncSchedule,
} from '@omnigrc/shared';
import {
  SaveDirectoryConfigDto,
  CreateOrUpdateGroupMappingDto,
  TestDirectoryConnectionDto,
  DirectorySyncLogsQueryDto,
} from './dto/directory.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DirectoryIntegrationService {
  private readonly logger = new Logger(DirectoryIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly graphClient: DirectoryGraphClient,
  ) {}

  /**
   * Retrieves active directory integration config for organization (secret is masked)
   */
  async getConfig(authCtx: ResourceAuthContext): Promise<DirectoryIntegrationConfigDto | null> {
    const config = await this.prisma.directoryIntegrationConfig.findUnique({
      where: { organizationId: authCtx.organizationId },
      include: {
        groupMappings: {
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!config) return null;

    return {
      id: config.id,
      organizationId: config.organizationId,
      provider: config.provider as DirectoryProvider,
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecretMasked: config.clientSecretMasked,
      domain: config.domain,
      enabled: config.enabled,
      defaultRole: config.defaultRole as Role,
      syncSchedule: config.syncSchedule as DirectorySyncSchedule,
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus as DirectorySyncStatus | null,
      lastSyncMessage: config.lastSyncMessage,
      autoDeactivateUsers: config.autoDeactivateUsers,
      deactivationThresholdPct: config.deactivationThresholdPct,
      groupMappings: config.groupMappings.map((m) => ({
        id: m.id,
        configId: m.configId,
        organizationId: m.organizationId,
        directoryGroupId: m.directoryGroupId,
        directoryGroupName: m.directoryGroupName,
        targetRole: m.targetRole as Role,
        priority: m.priority,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Saves or updates directory configuration with AES-256-GCM secret encryption
   */
  async saveConfig(
    authCtx: ResourceAuthContext,
    dto: SaveDirectoryConfigDto,
  ): Promise<DirectoryIntegrationConfigDto> {
    this.assertAdminRole(authCtx, 'Configure Directory Integration');

    const existing = await this.prisma.directoryIntegrationConfig.findUnique({
      where: { organizationId: authCtx.organizationId },
    });

    let clientSecretEncrypted = existing?.clientSecretEncrypted || '';
    let clientSecretMasked = existing?.clientSecretMasked || '••••••••••••';

    // If a new secret was provided, encrypt it
    if (dto.clientSecret && dto.clientSecret.trim().length > 0) {
      const secret = dto.clientSecret.trim();
      clientSecretEncrypted = DirectoryCryptoUtil.encryptSecret(secret);
      clientSecretMasked = DirectoryCryptoUtil.maskSecret(secret);
    } else if (!existing) {
      throw new BadRequestException('Client secret is required when setting up directory integration.');
    }

    const config = await this.prisma.directoryIntegrationConfig.upsert({
      where: { organizationId: authCtx.organizationId },
      create: {
        organizationId: authCtx.organizationId,
        provider: dto.provider || DirectoryProvider.ENTRA_ID,
        tenantId: dto.tenantId.trim(),
        clientId: dto.clientId.trim(),
        clientSecretEncrypted,
        clientSecretMasked,
        domain: dto.domain?.trim() || null,
        enabled: dto.enabled !== undefined ? dto.enabled : true,
        defaultRole: dto.defaultRole || Role.ANALYST,
        syncSchedule: dto.syncSchedule || DirectorySyncSchedule.MANUAL,
        autoDeactivateUsers: dto.autoDeactivateUsers !== undefined ? dto.autoDeactivateUsers : true,
        deactivationThresholdPct: dto.deactivationThresholdPct || 20,
        createdById: authCtx.userId,
      },
      update: {
        ...(dto.provider && { provider: dto.provider }),
        tenantId: dto.tenantId.trim(),
        clientId: dto.clientId.trim(),
        clientSecretEncrypted,
        clientSecretMasked,
        ...(dto.domain !== undefined && { domain: dto.domain?.trim() || null }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.defaultRole && { defaultRole: dto.defaultRole }),
        ...(dto.syncSchedule && { syncSchedule: dto.syncSchedule }),
        ...(dto.autoDeactivateUsers !== undefined && { autoDeactivateUsers: dto.autoDeactivateUsers }),
        ...(dto.deactivationThresholdPct && { deactivationThresholdPct: dto.deactivationThresholdPct }),
      },
      include: {
        groupMappings: {
          orderBy: { priority: 'asc' },
        },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'DIRECTORY_CONFIG_SAVED',
      entityType: 'DirectoryIntegrationConfig',
      entityId: config.id,
      metadata: {
        provider: config.provider,
        tenantId: config.tenantId,
        clientId: config.clientId,
        enabled: config.enabled,
        syncSchedule: config.syncSchedule,
      },
    });

    return {
      id: config.id,
      organizationId: config.organizationId,
      provider: config.provider as DirectoryProvider,
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecretMasked: config.clientSecretMasked,
      domain: config.domain,
      enabled: config.enabled,
      defaultRole: config.defaultRole as Role,
      syncSchedule: config.syncSchedule as DirectorySyncSchedule,
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus as DirectorySyncStatus | null,
      lastSyncMessage: config.lastSyncMessage,
      autoDeactivateUsers: config.autoDeactivateUsers,
      deactivationThresholdPct: config.deactivationThresholdPct,
      groupMappings: config.groupMappings.map((m) => ({
        id: m.id,
        configId: m.configId,
        organizationId: m.organizationId,
        directoryGroupId: m.directoryGroupId,
        directoryGroupName: m.directoryGroupName,
        targetRole: m.targetRole as Role,
        priority: m.priority,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Performs real or simulated test connection against Microsoft Graph API
   */
  async testConnection(
    authCtx: ResourceAuthContext,
    dto: TestDirectoryConnectionDto,
  ): Promise<DirectoryTestConnectionResultDto> {
    this.assertAdminRole(authCtx, 'Test Directory Connection');

    let clientSecret = dto.clientSecret?.trim();

    // If clientSecret not provided in request, resolve stored encrypted secret
    if (!clientSecret) {
      const existing = await this.prisma.directoryIntegrationConfig.findUnique({
        where: { organizationId: authCtx.organizationId },
      });
      if (existing?.clientSecretEncrypted) {
        try {
          clientSecret = DirectoryCryptoUtil.decryptSecret(existing.clientSecretEncrypted);
        } catch (err: any) {
          throw new BadRequestException('Failed to decrypt stored client secret. Please re-enter the secret.');
        }
      } else {
        throw new BadRequestException('Client secret must be provided for connection diagnostics.');
      }
    }

    return this.graphClient.testConnection(dto.tenantId.trim(), dto.clientId.trim(), clientSecret);
  }

  /**
   * Retrieves group mappings for organization
   */
  async getGroupMappings(authCtx: ResourceAuthContext): Promise<DirectoryGroupMappingDto[]> {
    const mappings = await this.prisma.directoryGroupMapping.findMany({
      where: { organizationId: authCtx.organizationId },
      orderBy: { priority: 'asc' },
    });

    return mappings.map((m) => ({
      id: m.id,
      configId: m.configId,
      organizationId: m.organizationId,
      directoryGroupId: m.directoryGroupId,
      directoryGroupName: m.directoryGroupName,
      targetRole: m.targetRole as Role,
      priority: m.priority,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
  }

  /**
   * Upserts a group-to-role mapping with strict privilege escalation prevention
   */
  async saveGroupMapping(
    authCtx: ResourceAuthContext,
    dto: CreateOrUpdateGroupMappingDto,
  ): Promise<DirectoryGroupMappingDto> {
    this.assertAdminRole(authCtx, 'Configure Group Mappings');

    const config = await this.prisma.directoryIntegrationConfig.findUnique({
      where: { organizationId: authCtx.organizationId },
    });

    if (!config) {
      throw new BadRequestException('Please configure directory integration before creating group mappings.');
    }

    // PRIVILEGE ESCALATION DEFENSE:
    // Only ADMIN or MSSP_ADMIN can configure mappings to ADMIN or MSSP_ADMIN
    if (dto.targetRole === Role.ADMIN || dto.targetRole === Role.MSSP_ADMIN) {
      if (authCtx.role !== Role.ADMIN && authCtx.role !== Role.MSSP_ADMIN) {
        throw new ForbiddenException(
          'Security Policy Violation: Only organization administrators can map directory groups to administrative roles.',
        );
      }

      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'SECURITY_ALERT_ADMIN_GROUP_MAPPED',
        entityType: 'DirectoryGroupMapping',
        entityId: dto.directoryGroupId,
        metadata: {
          groupName: dto.directoryGroupName,
          targetRole: dto.targetRole,
        },
      });
    }

    const mapping = await this.prisma.directoryGroupMapping.upsert({
      where: {
        configId_directoryGroupId: {
          configId: config.id,
          directoryGroupId: dto.directoryGroupId.trim(),
        },
      },
      create: {
        configId: config.id,
        organizationId: authCtx.organizationId,
        directoryGroupId: dto.directoryGroupId.trim(),
        directoryGroupName: dto.directoryGroupName.trim(),
        targetRole: dto.targetRole,
        priority: dto.priority !== undefined ? dto.priority : 100,
      },
      update: {
        directoryGroupName: dto.directoryGroupName.trim(),
        targetRole: dto.targetRole,
        priority: dto.priority !== undefined ? dto.priority : 100,
      },
    });

    return {
      id: mapping.id,
      configId: mapping.configId,
      organizationId: mapping.organizationId,
      directoryGroupId: mapping.directoryGroupId,
      directoryGroupName: mapping.directoryGroupName,
      targetRole: mapping.targetRole as Role,
      priority: mapping.priority,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    };
  }

  /**
   * Deletes a group-to-role mapping
   */
  async deleteGroupMapping(authCtx: ResourceAuthContext, mappingId: string): Promise<{ success: boolean }> {
    this.assertAdminRole(authCtx, 'Delete Group Mapping');

    const mapping = await this.prisma.directoryGroupMapping.findFirst({
      where: {
        id: mappingId,
        organizationId: authCtx.organizationId,
      },
    });

    if (!mapping) {
      throw new NotFoundException(`Group mapping with ID "${mappingId}" not found.`);
    }

    await this.prisma.directoryGroupMapping.delete({ where: { id: mappingId } });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'DIRECTORY_GROUP_MAPPING_DELETED',
      entityType: 'DirectoryGroupMapping',
      entityId: mappingId,
      metadata: {
        groupName: mapping.directoryGroupName,
        targetRole: mapping.targetRole,
      },
    });

    return { success: true };
  }

  /**
   * Executes directory synchronization: matches stable object IDs, maps attributes/roles,
   * enforces privilege escalation protection, and provides controlled deactivation with a circuit breaker.
   */
  async synchronizeDirectory(authCtx: ResourceAuthContext): Promise<DirectorySyncLogDto> {
    this.assertAdminRole(authCtx, 'Synchronize Directory');

    const startTime = new Date();

    const config = await this.prisma.directoryIntegrationConfig.findUnique({
      where: { organizationId: authCtx.organizationId },
      include: {
        groupMappings: {
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!config) {
      throw new BadRequestException('Directory integration is not configured for this organization.');
    }
    if (!config.enabled) {
      throw new BadRequestException('Directory integration is disabled. Please enable it before syncing.');
    }

    let clientSecret = '';
    try {
      clientSecret = DirectoryCryptoUtil.decryptSecret(config.clientSecretEncrypted);
    } catch (err: any) {
      throw new BadRequestException('Failed to decrypt directory client secret. Please re-enter the secret in settings.');
    }

    // 1. Fetch Users and Groups via Microsoft Graph
    let discoveredUsers: any[] = [];
    let discoveredGroups: any[] = [];
    try {
      const result = await this.graphClient.fetchUsersAndGroups(
        config.tenantId,
        config.clientId,
        clientSecret,
      );
      discoveredUsers = result.users;
      discoveredGroups = result.groups;
    } catch (err: any) {
      this.logger.error(`Failed to fetch from Microsoft Graph: ${err.message}`, err.stack);
      const failedLog = await this.recordSyncLog({
        configId: config.id,
        organizationId: authCtx.organizationId,
        status: DirectorySyncStatus.FAILED,
        errorMessage: `Failed to fetch users from Microsoft Graph: ${err.message}`,
        startedAt: startTime,
        completedAt: new Date(),
      });
      await this.prisma.directoryIntegrationConfig.update({
        where: { id: config.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: DirectorySyncStatus.FAILED,
          lastSyncMessage: err.message,
        },
      });
      return failedLog;
    }

    // 2. Build group mapping dictionary: directoryGroupId -> { targetRole, priority }
    const groupRoleMap = new Map<string, { role: Role; priority: number }>();
    for (const gm of config.groupMappings) {
      groupRoleMap.set(gm.directoryGroupId, {
        role: gm.targetRole as Role,
        priority: gm.priority,
      });
    }

    // 3. Load all existing users in this organization
    const existingUsers = await this.prisma.user.findMany({
      where: { organizationId: authCtx.organizationId },
      include: {
        memberships: {
          where: { organizationId: authCtx.organizationId },
        },
      },
    });

    // Lookup indexes
    const userByExternalId = new Map<string, (typeof existingUsers)[0]>();
    const userByEmail = new Map<string, (typeof existingUsers)[0]>();

    for (const u of existingUsers) {
      if (u.externalDirectoryId) {
        userByExternalId.set(u.externalDirectoryId, u);
      }
      if (u.email) {
        userByEmail.set(u.email.toLowerCase().trim(), u);
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    let deactivatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ userId?: string; email?: string; error: string }> = [];

    const activeDiscoveredExternalIds = new Set<string>();

    // 4. Upsert Users
    for (const entraUser of discoveredUsers) {
      try {
        const rawEmail = entraUser.mail || entraUser.userPrincipalName;
        if (!rawEmail || !rawEmail.includes('@')) {
          skippedCount++;
          continue;
        }

        const email = rawEmail.toLowerCase().trim();
        const displayName = entraUser.displayName?.trim() || email.split('@')[0];
        const externalId = entraUser.id;

        if (entraUser.accountEnabled) {
          activeDiscoveredExternalIds.add(externalId);
        }

        // Determine mapped role from groups
        let mappedRole = config.defaultRole as Role;
        let highestPriority = 999999;

        if (entraUser.groupMemberIds && entraUser.groupMemberIds.length > 0) {
          for (const grpId of entraUser.groupMemberIds) {
            const mapped = groupRoleMap.get(grpId);
            if (mapped && mapped.priority < highestPriority) {
              highestPriority = mapped.priority;
              mappedRole = mapped.role;
            }
          }
        }

        // Check matching existing user: stable externalDirectoryId first, fallback to email
        let existingUser = userByExternalId.get(externalId) || userByEmail.get(email);

        const targetStatus: ProductAccessStatus = entraUser.accountEnabled
          ? ProductAccessStatus.ACTIVE
          : ProductAccessStatus.SUSPENDED;

        if (existingUser) {
          // If role changed to ADMIN, log security alert
          if (
            (mappedRole === Role.ADMIN || mappedRole === Role.MSSP_ADMIN) &&
            existingUser.role !== mappedRole
          ) {
            await this.auditLogsService.log({
              organizationId: authCtx.organizationId,
              actorId: authCtx.userId,
              action: 'DIRECTORY_ADMIN_ROLE_PROVISIONED',
              entityType: 'User',
              entityId: existingUser.id,
              metadata: {
                userEmail: existingUser.email,
                grantedRole: mappedRole,
              },
            });
          }

          // Update existing user
          await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: existingUser!.id },
              data: {
                name: displayName,
                externalDirectoryId: externalId,
                jobTitle: entraUser.jobTitle || null,
                role: mappedRole,
                status: targetStatus,
                directorySyncedAt: new Date(),
              },
            });

            // Update membership status and role
            const membership = existingUser!.memberships[0];
            if (membership) {
              await tx.organizationMembership.update({
                where: { id: membership.id },
                data: {
                  role: mappedRole,
                  status: targetStatus,
                  ...(targetStatus === ProductAccessStatus.SUSPENDED && {
                    revokedAt: new Date(),
                    revokedById: authCtx.userId,
                  }),
                },
              });
            }
          });

          updatedCount++;
        } else {
          // Create new provisioned user
          const dummyPassword = await bcrypt.hash(`dir-sync-${Date.now()}-${Math.random()}`, 10);

          await this.prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
              data: {
                organizationId: authCtx.organizationId,
                name: displayName,
                email,
                passwordHash: dummyPassword,
                role: mappedRole,
                externalDirectoryId: externalId,
                jobTitle: entraUser.jobTitle || null,
                status: targetStatus,
                directorySyncedAt: new Date(),
                passwordSetupRequired: false,
              },
            });

            await tx.organizationMembership.create({
              data: {
                organizationId: authCtx.organizationId,
                userId: newUser.id,
                role: mappedRole,
                status: targetStatus,
              },
            });
          });

          createdCount++;
        }
      } catch (err: any) {
        errorCount++;
        errors.push({
          userId: entraUser.id,
          email: entraUser.mail || entraUser.userPrincipalName,
          error: err.message,
        });
      }
    }

    // 5. Controlled Deactivation & Mass Deactivation Circuit Breaker
    let circuitBreakerTriggered = false;
    let circuitBreakerMessage: string | null = null;

    if (config.autoDeactivateUsers) {
      // Find all existing users in organization who were previously synced (have externalDirectoryId)
      // and are currently ACTIVE, but are not present in active discovered IDs
      const deactivationCandidates = existingUsers.filter((u) => {
        return (
          u.externalDirectoryId &&
          u.status === ProductAccessStatus.ACTIVE &&
          !activeDiscoveredExternalIds.has(u.externalDirectoryId)
        );
      });

      const totalExistingSyncedUsers = existingUsers.filter((u) => u.externalDirectoryId).length;

      if (deactivationCandidates.length > 0) {
        const deactPct = (deactivationCandidates.length / Math.max(1, totalExistingSyncedUsers)) * 100;
        const threshold = config.deactivationThresholdPct || 20;

        // Mass Deactivation Circuit Breaker:
        // If more than 2 users and exceeding percentage threshold, HALT deactivation
        if (deactivationCandidates.length > 2 && deactPct > threshold) {
          circuitBreakerTriggered = true;
          circuitBreakerMessage = `Mass deactivation prevented: ${deactivationCandidates.length} users (${deactPct.toFixed(1)}%) flagged for deactivation, exceeding safety threshold (${threshold}%). Manual administrator verification is required.`;

          await this.auditLogsService.log({
            organizationId: authCtx.organizationId,
            actorId: authCtx.userId,
            action: 'DIRECTORY_MASS_DEACTIVATION_PREVENTED',
            entityType: 'DirectoryIntegrationConfig',
            entityId: config.id,
            metadata: {
              candidateCount: deactivationCandidates.length,
              totalSynced: totalExistingSyncedUsers,
              thresholdPct: threshold,
              computedPct: deactPct,
            },
          });
          this.logger.warn(circuitBreakerMessage);
        } else {
          // Execute controlled soft-deactivation
          for (const cand of deactivationCandidates) {
            try {
              await this.prisma.$transaction(async (tx) => {
                await tx.user.update({
                  where: { id: cand.id },
                  data: {
                    status: ProductAccessStatus.SUSPENDED,
                    directorySyncedAt: new Date(),
                  },
                });

                await tx.organizationMembership.updateMany({
                  where: {
                    userId: cand.id,
                    organizationId: authCtx.organizationId,
                  },
                  data: {
                    status: ProductAccessStatus.SUSPENDED,
                    revokedAt: new Date(),
                    revokedById: authCtx.userId,
                  },
                });
              });
              deactivatedCount++;
            } catch (err: any) {
              errorCount++;
              errors.push({
                userId: cand.id,
                email: cand.email,
                error: `Deactivation failed: ${err.message}`,
              });
            }
          }
        }
      }
    }

    // 6. Record Final Sync Status
    const completedAt = new Date();
    const finalStatus =
      errorCount > 0 && createdCount === 0 && updatedCount === 0
        ? DirectorySyncStatus.FAILED
        : circuitBreakerTriggered || errorCount > 0
        ? DirectorySyncStatus.PARTIAL
        : DirectorySyncStatus.SUCCESS;

    const summaryMessage = circuitBreakerTriggered
      ? circuitBreakerMessage!
      : `Sync completed: ${createdCount} created, ${updatedCount} updated, ${deactivatedCount} deactivated, ${errorCount} errors.`;

    const log = await this.recordSyncLog({
      configId: config.id,
      organizationId: authCtx.organizationId,
      status: finalStatus,
      discoveredCount: discoveredUsers.length,
      createdCount,
      updatedCount,
      deactivatedCount,
      skippedCount,
      errorCount,
      errorMessage: circuitBreakerTriggered ? circuitBreakerMessage : errorCount > 0 ? `${errorCount} errors encountered during sync.` : null,
      errorDetails: errors.length > 0 ? errors : undefined,
      startedAt: startTime,
      completedAt,
    });

    await this.prisma.directoryIntegrationConfig.update({
      where: { id: config.id },
      data: {
        lastSyncAt: completedAt,
        lastSyncStatus: finalStatus,
        lastSyncMessage: summaryMessage,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'DIRECTORY_SYNC_COMPLETED',
      entityType: 'DirectorySyncLog',
      entityId: log.id,
      metadata: {
        status: finalStatus,
        createdCount,
        updatedCount,
        deactivatedCount,
        errorCount,
      },
    });

    return log;
  }

  /**
   * Retrieves past directory synchronization logs
   */
  async getSyncLogs(
    authCtx: ResourceAuthContext,
    query: DirectorySyncLogsQueryDto,
  ): Promise<PaginatedDirectorySyncLogsDto> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.directorySyncLog.findMany({
        where: { organizationId: authCtx.organizationId },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.directorySyncLog.count({
        where: { organizationId: authCtx.organizationId },
      }),
    ]);

    return {
      items: items.map((l) => ({
        id: l.id,
        configId: l.configId,
        organizationId: l.organizationId,
        syncType: l.syncType,
        status: l.status as DirectorySyncStatus,
        discoveredCount: l.discoveredCount,
        createdCount: l.createdCount,
        updatedCount: l.updatedCount,
        deactivatedCount: l.deactivatedCount,
        skippedCount: l.skippedCount,
        errorCount: l.errorCount,
        errorMessage: l.errorMessage,
        errorDetails: l.errorDetails,
        startedAt: l.startedAt,
        completedAt: l.completedAt,
      })),
      total,
      page,
      limit,
    };
  }

  private async recordSyncLog(data: {
    configId: string;
    organizationId: string;
    syncType?: string;
    status: DirectorySyncStatus;
    discoveredCount?: number;
    createdCount?: number;
    updatedCount?: number;
    deactivatedCount?: number;
    skippedCount?: number;
    errorCount?: number;
    errorMessage?: string | null;
    errorDetails?: any;
    startedAt: Date;
    completedAt?: Date;
  }): Promise<DirectorySyncLogDto> {
    const created = await this.prisma.directorySyncLog.create({
      data: {
        configId: data.configId,
        organizationId: data.organizationId,
        syncType: data.syncType || 'MANUAL',
        status: data.status,
        discoveredCount: data.discoveredCount || 0,
        createdCount: data.createdCount || 0,
        updatedCount: data.updatedCount || 0,
        deactivatedCount: data.deactivatedCount || 0,
        skippedCount: data.skippedCount || 0,
        errorCount: data.errorCount || 0,
        errorMessage: data.errorMessage || null,
        errorDetails: data.errorDetails || undefined,
        startedAt: data.startedAt,
        completedAt: data.completedAt || new Date(),
      },
    });

    return {
      id: created.id,
      configId: created.configId,
      organizationId: created.organizationId,
      syncType: created.syncType,
      status: created.status as DirectorySyncStatus,
      discoveredCount: created.discoveredCount,
      createdCount: created.createdCount,
      updatedCount: created.updatedCount,
      deactivatedCount: created.deactivatedCount,
      skippedCount: created.skippedCount,
      errorCount: created.errorCount,
      errorMessage: created.errorMessage,
      errorDetails: created.errorDetails,
      startedAt: created.startedAt,
      completedAt: created.completedAt,
    };
  }

  private assertAdminRole(authCtx: ResourceAuthContext, actionName: string): void {
    if (authCtx.role !== Role.ADMIN && authCtx.role !== Role.MSSP_ADMIN) {
      throw new ForbiddenException(
        `Access Denied: Only organization administrators can execute "${actionName}".`,
      );
    }
  }
}

