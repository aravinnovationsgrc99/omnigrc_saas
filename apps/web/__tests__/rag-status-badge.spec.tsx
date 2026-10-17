import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import {
  RagStatusBadge,
  getVendorRag,
  getRiskRag,
  getAuditPlanRag,
} from '../src/components/ui/rag-status-badge';

describe('Contextual RAG Status Mapping & Component', () => {
  describe('getVendorRag thresholds', () => {
    it('returns NEUTRAL with "Unassessed" for missing/null/undefined score', () => {
      expect(getVendorRag(null).status).toBe('NEUTRAL');
      expect(getVendorRag(undefined).status).toBe('NEUTRAL');
      expect(getVendorRag(NaN).status).toBe('NEUTRAL');
      expect(getVendorRag(null).label).toBe('Unassessed');
    });

    it('returns GREEN for scores >= 80', () => {
      const res80 = getVendorRag(80);
      expect(res80.status).toBe('GREEN');
      expect(res80.label).toBe('Low Risk');

      const res100 = getVendorRag(100);
      expect(res100.status).toBe('GREEN');
    });

    it('returns AMBER for scores between 50 and 79', () => {
      const res50 = getVendorRag(50);
      expect(res50.status).toBe('AMBER');
      expect(res50.label).toBe('Medium Risk');

      const res79 = getVendorRag(79);
      expect(res79.status).toBe('AMBER');
    });

    it('returns RED for scores < 50', () => {
      const res49 = getVendorRag(49);
      expect(res49.status).toBe('RED');
      expect(res49.label).toBe('High Risk');

      const res0 = getVendorRag(0);
      expect(res0.status).toBe('RED');
    });
  });

  describe('getRiskRag thresholds', () => {
    it('returns NEUTRAL with "Unrated" for 0 or missing score', () => {
      expect(getRiskRag(null).status).toBe('NEUTRAL');
      expect(getRiskRag(undefined).status).toBe('NEUTRAL');
      expect(getRiskRag(0).status).toBe('NEUTRAL');
      expect(getRiskRag(0).label).toBe('Unrated');
    });

    it('returns RED for high risk scores >= 15', () => {
      const res15 = getRiskRag(15);
      expect(res15.status).toBe('RED');
      expect(res15.label).toBe('High Risk');

      const res25 = getRiskRag(25);
      expect(res25.status).toBe('RED');
    });

    it('returns AMBER for medium risk scores between 8 and 14', () => {
      const res8 = getRiskRag(8);
      expect(res8.status).toBe('AMBER');
      expect(res8.label).toBe('Medium Risk');

      const res14 = getRiskRag(14);
      expect(res14.status).toBe('AMBER');
    });

    it('returns GREEN for low risk scores between 1 and 7', () => {
      const res1 = getRiskRag(1);
      expect(res1.status).toBe('GREEN');
      expect(res1.label).toBe('Low Risk');

      const res7 = getRiskRag(7);
      expect(res7.status).toBe('GREEN');
    });
  });

  describe('getAuditPlanRag thresholds', () => {
    it('returns NEUTRAL for DRAFT and PLANNED audits', () => {
      expect(getAuditPlanRag('DRAFT').status).toBe('NEUTRAL');
      expect(getAuditPlanRag('PLANNED').status).toBe('NEUTRAL');
    });

    it('returns RED if any check items are NON_COMPLIANT', () => {
      const res = getAuditPlanRag('IN_PROGRESS', [
        {
          checkItems: [
            { result: 'COMPLIANT' },
            { result: 'NON_COMPLIANT' },
          ],
        },
      ]);
      expect(res.status).toBe('RED');
      expect(res.label).toBe('Non-Conformant');
    });

    it('returns AMBER for audits currently IN_PROGRESS with no failures yet', () => {
      const res = getAuditPlanRag('IN_PROGRESS', [
        { checkItems: [{ result: 'COMPLIANT' }] },
      ]);
      expect(res.status).toBe('AMBER');
      expect(res.label).toBe('In Execution');
    });

    it('returns GREEN for COMPLETED audits without non-compliant findings', () => {
      const res = getAuditPlanRag('COMPLETED', [
        { checkItems: [{ result: 'COMPLIANT' }, { result: 'COMPLIANT' }] },
      ]);
      expect(res.status).toBe('GREEN');
      expect(res.label).toBe('Conformant');
    });
  });

  describe('RagStatusBadge UI Component', () => {
    it('renders with accessible role="status" and correct OMNiGRC tokens', () => {
      const { rerender } = render(<RagStatusBadge status="GREEN" label="Passed" />);
      const greenBadge = screen.getByRole('status');
      expect(greenBadge).toHaveClass('omni-badge-teal');
      expect(greenBadge).toHaveTextContent('Passed');

      rerender(<RagStatusBadge status="AMBER" label="Warning" />);
      const amberBadge = screen.getByRole('status');
      expect(amberBadge).toHaveClass('omni-badge-amber');

      rerender(<RagStatusBadge status="RED" label="Critical" />);
      const redBadge = screen.getByRole('status');
      expect(redBadge).toHaveClass('omni-badge-rose');

      rerender(<RagStatusBadge status="NEUTRAL" label="Unassessed" />);
      const neutralBadge = screen.getByRole('status');
      expect(neutralBadge).toHaveClass('omni-badge-slate');
    });
  });
});
