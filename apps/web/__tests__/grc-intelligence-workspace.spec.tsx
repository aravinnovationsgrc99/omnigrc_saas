import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GrcIntelligenceView } from '../src/components/intelligence/grc-intelligence-view';
import { EXACT_TEN_PREDEFINED_QUESTIONS } from '@omnigrc/shared';
import * as apiClient from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  apiRequest: jest.fn(),
}));

describe('GrcIntelligenceView Workspace Acceptance Suite', () => {
  const mockApiRequest = apiClient.apiRequest as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = jest.fn();

    // Default mock response for GET /intelligence/questions
    mockApiRequest.mockImplementation((url: string, options?: any) => {
      if (url === '/intelligence/questions') {
        return Promise.resolve({ questions: EXACT_TEN_PREDEFINED_QUESTIONS });
      }
      if (url === '/intelligence/chat') {
        return Promise.resolve({
          answer: '**Executive Summary**\nYour organization maintains 42 security controls and 1 active framework entitlement.',
          structuredAnalysis: {
            summary: 'Your organization maintains 42 security controls and 1 active framework entitlement.',
            keyFindings: ['Active licensed frameworks include: ISO 27001.', '42 controls mapped.'],
            metrics: [
              { label: 'Active Frameworks', value: 1, trend: 'neutral' },
              { label: 'Registered Controls', value: 42, trend: 'good' },
            ],
            recommendations: ['Review evidence attachments.'],
          },
          citations: [
            {
              id: 'fw-iso-27001',
              title: 'ISO/IEC 27001:2022',
              domain: 'compliance',
              recordType: 'Framework Entitlement',
              viewTarget: 'frameworks',
              targetId: 'fw-iso-27001',
              statusOrDate: 'Status: ACTIVE',
              snippet: 'Commercial Entitlement',
            },
          ],
          suggestedFollowUps: ['Which controls are missing evidence?'],
          intent: 'COMPLIANCE_POSTURE',
          isLiveAi: true,
          inferenceMode: 'LIVE_AI',
          providerName: 'Google Gemini 2.5 Flash',
        });
      }
      return Promise.resolve({});
    });
  });

  it('renders workspace with header, transparent AI provider badge, and disclaimer', async () => {
    render(<GrcIntelligenceView />);

    expect(screen.getByText('GRC Intelligence System')).toBeInTheDocument();
    expect(screen.getByTestId('provider-badge-live')).toBeInTheDocument();
    expect(screen.getByText(/Advisory Disclaimer:/)).toBeInTheDocument();
  });

  it('renders exact 10 standardized discovery questions', async () => {
    render(<GrcIntelligenceView />);

    await waitFor(() => {
      expect(screen.getByTestId('suggested-questions-panel')).toBeInTheDocument();
    });

    // Check presence of key discovery labels
    expect(screen.getByText('Compliance Posture')).toBeInTheDocument();
    expect(screen.getByText('Highest Risk Items')).toBeInTheDocument();
    expect(screen.getByText('High-Risk Vendors')).toBeInTheDocument();
  });

  it('submits query and displays grounded response with metrics and citations', async () => {
    const onNavigateSpy = jest.fn();
    render(<GrcIntelligenceView onNavigateToView={onNavigateSpy} />);

    const input = screen.getByPlaceholderText(/Ask any question about risks/);
    fireEvent.change(input, { target: { value: 'What is our compliance posture?' } });

    const sendBtn = screen.getByRole('button', { name: /Send Query/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/intelligence/chat',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Your organization maintains 42 security controls/)).toBeInTheDocument();
      expect(screen.getByText('Active Frameworks')).toBeInTheDocument();
      expect(screen.getByText('Registered Controls')).toBeInTheDocument();
    });

    // Check clickable citation
    const citationBtn = screen.getByText('ISO/IEC 27001:2022');
    expect(citationBtn).toBeInTheDocument();

    fireEvent.click(citationBtn);
    expect(onNavigateSpy).toHaveBeenCalledWith('frameworks', { id: 'fw-iso-27001' });
  });

  it('displays contextual follow-up chips and triggers follow-up query', async () => {
    render(<GrcIntelligenceView />);

    const input = screen.getByPlaceholderText(/Ask any question about risks/);
    fireEvent.change(input, { target: { value: 'What is our compliance posture?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Query/i }));

    await waitFor(() => {
      expect(screen.getByText('Which controls are missing evidence?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Which controls are missing evidence?'));

    await waitFor(() => {
      // 1 for questions on mount + 1 for initial query + 1 for follow-up query = 3
      expect(mockApiRequest).toHaveBeenCalledTimes(3);
    });
  });

  it('displays deterministic fallback badge when API indicates fallback mode', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url === '/intelligence/questions') {
        return Promise.resolve({ questions: EXACT_TEN_PREDEFINED_QUESTIONS });
      }
      if (url === '/intelligence/chat') {
        return Promise.resolve({
          answer: 'Deterministic fallback answer.',
          isLiveAi: false,
          inferenceMode: 'DETERMINISTIC_FALLBACK',
          providerName: 'Deterministic Grounded Engine',
        });
      }
      return Promise.resolve({});
    });

    render(<GrcIntelligenceView />);

    const input = screen.getByPlaceholderText(/Ask any question about risks/);
    fireEvent.change(input, { target: { value: 'Test query' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Query/i }));

    await waitFor(() => {
      expect(screen.getByTestId('provider-badge-fallback')).toBeInTheDocument();
    });
  });
});
