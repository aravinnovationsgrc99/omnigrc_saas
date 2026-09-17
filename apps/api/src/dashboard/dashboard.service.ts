import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  DEFAULT_WIDGET_LAYOUT,
  UserDashboardPreferenceDto,
  WidgetLayoutItem,
} from '@omnigrc/shared';
import { UpdateDashboardPreferenceDto } from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  public reconcileLayout(storedLayout: WidgetLayoutItem[]): WidgetLayoutItem[] {
    const defaultIds = new Set(DEFAULT_WIDGET_LAYOUT.map((w) => w.id));

    // Filter out stale widget IDs
    const validStored = (storedLayout || []).filter(
      (item) => item && typeof item.id === 'string' && defaultIds.has(item.id),
    );

    const presentIds = new Set(validStored.map((item) => item.id));

    // Append newly added default widgets
    const missingDefaults = DEFAULT_WIDGET_LAYOUT.filter(
      (item) => !presentIds.has(item.id),
    );

    const combined = [...validStored, ...missingDefaults];

    // Re-index position
    return combined.map((item, index) => ({
      id: item.id,
      visible: typeof item.visible === 'boolean' ? item.visible : true,
      position: index,
    }));
  }

  async getUserPreference(
    userId: string,
    organizationId: string,
  ): Promise<UserDashboardPreferenceDto> {
    const preference = await this.prisma.userDashboardPreference.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    if (!preference) {
      return {
        id: `default-${userId}-${organizationId}`,
        userId,
        organizationId,
        configJson: {
          version: 1,
          layout: DEFAULT_WIDGET_LAYOUT,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const rawConfig = preference.configJson as any;
    const rawLayout: WidgetLayoutItem[] = Array.isArray(rawConfig?.layout)
      ? rawConfig.layout
      : DEFAULT_WIDGET_LAYOUT;

    const reconciled = this.reconcileLayout(rawLayout);

    return {
      id: preference.id,
      userId: preference.userId,
      organizationId: preference.organizationId,
      configJson: {
        version: rawConfig?.version || 1,
        layout: reconciled,
      },
      createdAt: preference.createdAt.toISOString(),
      updatedAt: preference.updatedAt.toISOString(),
    };
  }

  async updateUserPreference(
    userId: string,
    organizationId: string,
    dto: UpdateDashboardPreferenceDto,
  ): Promise<UserDashboardPreferenceDto> {
    const reconciled = this.reconcileLayout(dto.layout || []);
    const configJson: any = {
      version: 1,
      layout: reconciled,
    };

    const updated = await this.prisma.userDashboardPreference.upsert({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      create: {
        userId,
        organizationId,
        configJson,
      },
      update: {
        configJson,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'DASHBOARD_PREFERENCE_UPDATED',
      entityType: 'UserDashboardPreference',
      entityId: updated.id,
      metadata: { widgetCount: reconciled.length, visibleCount: reconciled.filter((w) => w.visible).length },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      organizationId: updated.organizationId,
      configJson: {
        version: 1,
        layout: reconciled,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
