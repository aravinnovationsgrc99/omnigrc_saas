import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AiRouterService } from './ai-router.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface GrcIntelligenceAssistDto {
  prompt?: string;
  controlId?: string;
  frameworkCode?: string;
}

@Controller('intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GrcIntelligenceController {
  constructor(
    private readonly aiRouterService: AiRouterService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('assist')
  async getAiAssistance(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: GrcIntelligenceAssistDto,
  ) {
    let controlName = 'General GRC Assistance';
    let controlDescription = dto.prompt || 'Provide compliance analysis and recommendations.';

    if (dto.controlId) {
      const ctrl = await this.prisma.control.findFirst({
        where: { id: dto.controlId, organizationId, deletedAt: null },
      });
      if (ctrl) {
        controlName = ctrl.name;
        controlDescription = `${ctrl.description} ${dto.prompt ? `User query: ${dto.prompt}` : ''}`;
      }
    }

    const clauses = await this.prisma.frameworkClause.findMany({
      take: 5,
      include: { framework: true },
    });

    const candidates = clauses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      frameworkCode: c.framework.code,
    }));

    const result = await this.aiRouterService.executeMapping({
      organizationId,
      actorId: userId,
      controlId: dto.controlId || 'general-assistant',
      controlName,
      controlDescription,
      candidates,
    });

    return {
      disclaimer: 'AI Assistance — Suggestions are generated for advisory review and must be authoritatively verified by a compliance analyst.',
      tierUsed: result.tierUsed,
      suggestions: result.acceptedSuggestions,
      query: { controlName, controlDescription },
    };
  }
}
