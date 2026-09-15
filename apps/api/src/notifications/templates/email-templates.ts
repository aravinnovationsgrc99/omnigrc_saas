export enum PriorityLevel {
  P0 = 'P0', // Critical Transactional (Security, Auth, Task Assignment, Pod Status)
  P1 = 'P1', // High-Risk Escalations
  P2 = 'P2', // Due-Date Reminders
  P3 = 'P3', // Executive Weekly Digest
}

export interface AlertEmailTemplateParams {
  userName: string;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId: string;
}

export interface WeeklyDigestTemplateParams {
  userName: string;
  orgName: string;
  pendingTasks: number;
  overdueTasks: number;
  openRisks: number;
  highRisks: number;
}

export interface RiskEscalationTemplateParams {
  userName: string;
  riskTitle: string;
  score: number;
  owner: string;
  treatmentPlan?: string | null;
}

export function renderAlertEmailHtml(params: AlertEmailTemplateParams): string {
  const { userName, message, type, entityType, entityId } = params;
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #e2e6e4; border-radius: 8px;">
      <h2 style="color: #0F6E6A; font-size: 18px; margin-top: 0;">OMNiGRC Platform Alert</h2>
      <p style="font-size: 14px; color: #1B2430;">Hello <strong>${escapeHtml(userName)}</strong>,</p>
      <p style="font-size: 14px; color: #5B6672; line-height: 1.5;">${escapeHtml(message)}</p>
      <div style="background: #FAFBFB; border: 1px solid #EDEFED; border-radius: 6px; padding: 12px; font-size: 12px; color: #6E7A8A; margin: 16px 0;">
        <div><strong>Event Type:</strong> ${escapeHtml(type)}</div>
        <div><strong>Entity:</strong> ${escapeHtml(entityType)} (${escapeHtml(entityId)})</div>
      </div>
      <p style="font-size: 12px; color: #8B95A1; margin-bottom: 0;">You received this because email notifications are enabled in your OMNiGRC profile settings.</p>
    </div>
  `;
}

export function renderWeeklyDigestHtml(params: WeeklyDigestTemplateParams): string {
  const { userName, orgName, pendingTasks, overdueTasks, openRisks, highRisks } = params;
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #e2e6e4; border-radius: 8px;">
      <h2 style="color: #0F6E6A; font-size: 18px; margin-top: 0;">OMNiGRC Executive Weekly Digest</h2>
      <p style="font-size: 14px; color: #1B2430;">Hello <strong>${escapeHtml(userName)}</strong>,</p>
      <p style="font-size: 14px; color: #5B6672; line-height: 1.5;">Here is the weekly GRC compliance summary for <strong>${escapeHtml(orgName)}</strong>:</p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;">
        <div style="background: #F4FBFB; border: 1px solid #D2F0EE; border-radius: 6px; padding: 12px; text-align: center;">
          <div style="font-size: 20px; font-weight: bold; color: #0F6E6A;">${overdueTasks}</div>
          <div style="font-size: 11px; color: #5B6672; margin-top: 4px;">Overdue Tasks</div>
        </div>
        <div style="background: #FFF8F6; border: 1px solid #FEE5DF; border-radius: 6px; padding: 12px; text-align: center;">
          <div style="font-size: 20px; font-weight: bold; color: #D9381E;">${highRisks}</div>
          <div style="font-size: 11px; color: #5B6672; margin-top: 4px;">High-Severity Risks</div>
        </div>
      </div>

      <div style="background: #FAFBFB; border: 1px solid #EDEFED; border-radius: 6px; padding: 12px; font-size: 13px; color: #1B2430; margin-bottom: 16px;">
        <div style="margin-bottom: 6px;"><strong>Active Pending Tasks:</strong> ${pendingTasks}</div>
        <div><strong>Total Open Risks:</strong> ${openRisks}</div>
      </div>

      <p style="font-size: 12px; color: #8B95A1; margin-bottom: 0;">Weekly digests are sent automatically to organization administrators.</p>
    </div>
  `;
}

export function renderRiskEscalationHtml(params: RiskEscalationTemplateParams): string {
  const { userName, riskTitle, score, owner, treatmentPlan } = params;
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #FEE5DF; border-radius: 8px; background: #FFFCFC;">
      <h2 style="color: #D9381E; font-size: 18px; margin-top: 0;">🚨 HIGH-RISK SLA ESCALATION</h2>
      <p style="font-size: 14px; color: #1B2430;">Hello <strong>${escapeHtml(userName)}</strong>,</p>
      <p style="font-size: 14px; color: #5B6672; line-height: 1.5;">
        A high-severity risk requiring immediate mitigation attention remains active:
      </p>
      <div style="background: #FFF8F6; border: 1px solid #FEE5DF; border-radius: 6px; padding: 12px; font-size: 13px; color: #1B2430; margin: 16px 0;">
        <div style="margin-bottom: 6px;"><strong>Risk Title:</strong> ${escapeHtml(riskTitle)}</div>
        <div style="margin-bottom: 6px;"><strong>Risk Score:</strong> <span style="color: #D9381E; font-weight: bold;">${score} (HIGH)</span></div>
        <div style="margin-bottom: 6px;"><strong>Assigned Owner:</strong> ${escapeHtml(owner)}</div>
        <div><strong>Treatment Plan:</strong> ${escapeHtml(treatmentPlan || 'None specified')}</div>
      </div>
      <p style="font-size: 12px; color: #8B95A1; margin-bottom: 0;">Risk escalations are triggered daily for risks with a canonical score &ge; 15.</p>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
