import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect } from './searchable-select';

describe('SearchableSelect Component', () => {
  const options = [
    { value: 'iso27001', label: 'ISO/IEC 27001:2022', description: 'Information Security' },
    { value: 'soc2', label: 'SOC 2 Type II', description: 'Trust Services Criteria' },
    { value: 'gdpr', label: 'GDPR 2016/679', description: 'EU General Data Protection' },
  ];

  it('renders trigger button with placeholder when no value selected', () => {
    const handleChange = jest.fn();
    render(<SearchableSelect options={options} onChange={handleChange} placeholder="Select framework..." />);

    expect(screen.getByRole('button', { name: /select framework/i })).toBeInTheDocument();
  });

  it('opens dropdown popover on click and filters options by search', () => {
    const handleChange = jest.fn();
    render(<SearchableSelect options={options} onChange={handleChange} placeholder="Select framework..." />);

    const trigger = screen.getByRole('button', { name: /select framework/i });
    fireEvent.click(trigger);

    // Dropdown listbox should be visible
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /iso\/iec 27001/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /soc 2/i })).toBeInTheDocument();

    // Type in search box
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'GDPR' } });

    // Only GDPR should match
    expect(screen.getByRole('option', { name: /gdpr/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /soc 2/i })).not.toBeInTheDocument();

    // Select GDPR
    fireEvent.click(screen.getByRole('option', { name: /gdpr/i }));
    expect(handleChange).toHaveBeenCalledWith('gdpr');
  });
});

