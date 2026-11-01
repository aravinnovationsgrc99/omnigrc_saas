import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumbs } from './breadcrumbs';

describe('Breadcrumbs Component', () => {
  it('renders Dashboard as current page when on dashboard view', () => {
    render(<Breadcrumbs currentView="dashboard" />);
    const current = screen.getByText('Dashboard');
    expect(current).toBeInTheDocument();
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('renders Dashboard link and module page when on audit management', () => {
    const handleNavigate = jest.fn();
    render(<Breadcrumbs currentView="audits" onNavigateToView={handleNavigate} />);

    // Dashboard should be a clickable link
    const dashboardBtn = screen.getByRole('button', { name: /dashboard/i });
    expect(dashboardBtn).toBeInTheDocument();

    // Audit Management should be active current item
    const auditText = screen.getByText('Audit Management');
    expect(auditText).toHaveAttribute('aria-current', 'page');

    // Clicking Dashboard calls onNavigateToView('dashboard')
    fireEvent.click(dashboardBtn);
    expect(handleNavigate).toHaveBeenCalledWith('dashboard', undefined);
  });

  it('renders custom breadcrumb chain for nested record pages', () => {
    const handleNavigate = jest.fn();
    const items = [
      { label: 'Control Mapping', view: 'controls' },
      { label: 'Control AC-1 Details', active: true },
    ];

    render(<Breadcrumbs items={items} onNavigateToView={handleNavigate} />);

    // Dashboard root should be auto-prepended
    expect(screen.getByRole('button', { name: /dashboard/i })).toBeInTheDocument();

    // Control Mapping parent link
    const controlsBtn = screen.getByRole('button', { name: /control mapping/i });
    expect(controlsBtn).toBeInTheDocument();
    fireEvent.click(controlsBtn);
    expect(handleNavigate).toHaveBeenCalledWith('controls', undefined);

    // Current detail item
    const detailItem = screen.getByText('Control AC-1 Details');
    expect(detailItem).toHaveAttribute('aria-current', 'page');
  });

  it('provides proper semantic navigation landmark', () => {
    render(<Breadcrumbs currentView="policies" />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
  });
});

