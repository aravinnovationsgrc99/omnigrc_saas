import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './sidebar';

jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Security Lead', role: 'ADMIN' },
    organization: { id: 'o1', name: 'Test Org' },
    hasCapability: () => true,
    capabilities: ['FRAMEWORK_LIBRARY', 'BUSINESS_AUDITS'],
    capabilitiesStatus: 'loaded',
    loading: false,
  }),
}));

describe('Sidebar Component', () => {
  it('renders expanded sidebar with official OMNiGRC logo and collapse control', () => {
    const handleToggle = jest.fn();
    const handleSetView = jest.fn();

    render(
      <Sidebar
        view="dashboard"
        setView={handleSetView}
        collapsed={false}
        onToggleCollapse={handleToggle}
      />
    );

    // OMNiGRC Logo image should be present with correct path
    const logoImg = screen.getByAltText('OMNiGRC Logo');
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveAttribute('src', '/brand/omnigrc-logo.png');

    // Brand name displayed
    expect(screen.getByText('OMNiGRC')).toBeInTheDocument();

    // Collapse toggle button displayed
    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(collapseBtn).toBeInTheDocument();

    fireEvent.click(collapseBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);

    // Navigating to Audit Management
    const auditBtn = screen.getByRole('button', { name: /audit management/i });
    fireEvent.click(auditBtn);
    expect(handleSetView).toHaveBeenCalledWith('audits');
  });

  it('renders collapsed sidebar with expand button and accessible navigation icons', () => {
    const handleToggle = jest.fn();
    const handleSetView = jest.fn();

    render(
      <Sidebar
        view="audits"
        setView={handleSetView}
        collapsed={true}
        onToggleCollapse={handleToggle}
      />
    );

    // Logo still present in collapsed state
    const logoImg = screen.getByAltText('OMNiGRC Logo');
    expect(logoImg).toBeInTheDocument();

    // Expand button should be visible
    const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
    expect(expandBtn).toBeInTheDocument();

    fireEvent.click(expandBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);

    // Active item should indicate current page
    const activeBtn = screen.getByRole('button', { name: /audit management/i });
    expect(activeBtn).toHaveAttribute('aria-current', 'page');
  });
});

