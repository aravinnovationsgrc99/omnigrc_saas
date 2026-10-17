import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FrameworkClausesModal, FrameworkSummary, FrameworkClauseItem } from '../src/components/controls/framework-clauses-modal';

describe('FrameworkClausesModal', () => {
  const mockFramework: FrameworkSummary = {
    id: 'fw-iso-27001',
    code: 'ISO27001',
    name: 'ISO/IEC 27001:2022 Information Security',
    clauseCount: 3,
  };

  const mockClauses: FrameworkClauseItem[] = [
    {
      id: 'clause-1',
      frameworkId: 'fw-iso-27001',
      code: 'A.5.1',
      title: 'Policies for information security',
    },
    {
      id: 'clause-2',
      frameworkId: 'fw-iso-27001',
      code: 'A.5.15',
      title: 'Access control',
    },
    {
      id: 'clause-3',
      frameworkId: 'fw-iso-27001',
      code: 'A.8.20',
      title: 'Network security',
    },
  ];

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <FrameworkClausesModal
        isOpen={false}
        onClose={jest.fn()}
        framework={mockFramework}
        clauses={mockClauses}
        onSelectMapClause={jest.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders framework header, badges, and all clauses when open', () => {
    render(
      <FrameworkClausesModal
        isOpen={true}
        onClose={jest.fn()}
        framework={mockFramework}
        clauses={mockClauses}
        onSelectMapClause={jest.fn()}
      />
    );

    expect(screen.getByText('ISO 27001 Clauses')).toBeInTheDocument();
    expect(screen.getByText(/ISO\/IEC 27001:2022 Information Security/i)).toBeInTheDocument();
    expect(screen.getByText('A.5.1')).toBeInTheDocument();
    expect(screen.getByText('Policies for information security')).toBeInTheDocument();
    expect(screen.getByText('A.5.15')).toBeInTheDocument();
    expect(screen.getByText('A.8.20')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /map/i })).toHaveLength(3);
  });

  it('filters clauses dynamically when searching with zero lag', () => {
    render(
      <FrameworkClausesModal
        isOpen={true}
        onClose={jest.fn()}
        framework={mockFramework}
        clauses={mockClauses}
        onSelectMapClause={jest.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search iso27001 clause/i);
    fireEvent.change(searchInput, { target: { value: 'access' } });

    expect(screen.getByText('A.5.15')).toBeInTheDocument();
    expect(screen.getByText('Access control')).toBeInTheDocument();
    expect(screen.queryByText('A.8.20')).not.toBeInTheDocument();
    expect(screen.queryByText('A.5.1')).not.toBeInTheDocument();
  });

  it('triggers onSelectMapClause with framework and clause when clicking Map', () => {
    const onSelectMap = jest.fn();
    render(
      <FrameworkClausesModal
        isOpen={true}
        onClose={jest.fn()}
        framework={mockFramework}
        clauses={mockClauses}
        onSelectMapClause={onSelectMap}
      />
    );

    const mapButtons = screen.getAllByRole('button', { name: /map/i });
    fireEvent.click(mapButtons[0]);

    expect(onSelectMap).toHaveBeenCalledTimes(1);
    expect(onSelectMap).toHaveBeenCalledWith(mockFramework, mockClauses[0]);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <FrameworkClausesModal
        isOpen={true}
        onClose={onClose}
        framework={mockFramework}
        clauses={mockClauses}
        onSelectMapClause={jest.fn()}
      />
    );

    const closeBtn = screen.getByLabelText(/close modal/i);
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
