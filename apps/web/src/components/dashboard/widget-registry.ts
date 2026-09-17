import { DEFAULT_WIDGET_LAYOUT, WidgetLayoutItem } from '@omnigrc/shared';
import {
  ShieldAlert,
  CheckSquare,
  FileCheck,
  Bug,
  BookOpen,
  Building2,
  Server,
} from 'lucide-react';

export interface WidgetMeta {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: any;
}

export const WIDGET_METADATA: Record<string, WidgetMeta> = {
  risk_overview: {
    id: 'risk_overview',
    title: 'Risk Overview',
    category: 'Risk Management',
    description: 'Open risks breakdown by score band (High, Medium, Low) and treatment status',
    icon: ShieldAlert,
  },
  compliance_obligations: {
    id: 'compliance_obligations',
    title: 'Compliance & Obligations',
    category: 'Compliance',
    description: 'Obligation task completion rate, upcoming reviews, and overdue obligations',
    icon: CheckSquare,
  },
  audit_readiness: {
    id: 'audit_readiness',
    title: 'Audit Readiness',
    category: 'Audit Management',
    description: 'Overall audit score, active assessments, open findings, and CAPA progress',
    icon: FileCheck,
  },
  vulnerability_posture: {
    id: 'vulnerability_posture',
    title: 'Vulnerability Posture',
    category: 'Security Operations',
    description: 'Vulnerability counts by severity (Critical, High, Medium, Low) and SLA compliance',
    icon: Bug,
  },
  policy_governance: {
    id: 'policy_governance',
    title: 'Policy Governance',
    category: 'Governance',
    description: 'Published policy metrics, review cadences, and pending policy exceptions',
    icon: BookOpen,
  },
  vendor_risk: {
    id: 'vendor_risk',
    title: 'Vendor Risk',
    category: 'Third-Party Risk',
    description: 'Third-party vendor counts by criticality and assessment review status',
    icon: Building2,
  },
  asset_inventory: {
    id: 'asset_inventory',
    title: 'Asset Inventory',
    category: 'Asset Management',
    description: 'Asset criticality distribution, environment coverage, and managed status',
    icon: Server,
  },
};

export function reconcileLayout(storedLayout: WidgetLayoutItem[]): WidgetLayoutItem[] {
  const defaultIds = new Set(DEFAULT_WIDGET_LAYOUT.map((w) => w.id));

  // Filter out stale widget IDs
  const validStored = (storedLayout || []).filter(
    (item) => item && typeof item.id === 'string' && defaultIds.has(item.id),
  );

  const presentIds = new Set(validStored.map((item) => item.id));

  // Append missing default widgets
  const missingDefaults = DEFAULT_WIDGET_LAYOUT.filter(
    (item) => !presentIds.has(item.id),
  );

  const combined = [...validStored, ...missingDefaults];

  return combined.map((item, index) => ({
    id: item.id,
    visible: typeof item.visible === 'boolean' ? item.visible : true,
    position: index,
  }));
}
