import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfirmationDialog } from '../src/components/ui/confirmation-dialog';

describe('ConfirmationDialog Security & Accessibility Primitive', () => {
  it('1. should render title, explanation, and dialog role attributes when open', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Revoke License"
        explanation="This action will permanently revoke the selected commercial license."
        consequence="Deployments bound to this license will fail runtime verification."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Revoke License')).toBeInTheDocument();
    expect(
      screen.getByText('This action will permanently revoke the selected commercial license.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Deployments bound to this license will fail runtime verification.'),
    ).toBeInTheDocument();
  });

  it('2. should enforce exact confirmation phrase match before enabling submit button', () => {
    const handleConfirm = jest.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Revoke License"
        explanation="Revocation confirmation test"
        confirmationPhrase="REVOKE"
        onConfirm={handleConfirm}
        onCancel={jest.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /confirm action/i });
    expect(submitBtn).toBeDisabled();

    const phraseInput = screen.getByPlaceholderText('Type "REVOKE"');
    fireEvent.change(phraseInput, { target: { value: 'wrong' } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(phraseInput, { target: { value: 'REVOKE' } });
    expect(submitBtn).toBeEnabled();
  });

  it('3. should enforce mandatory audit reason input length when reasonRequired is true', () => {
    const handleConfirm = jest.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Suspend Organization"
        explanation="Suspension audit reason test"
        reasonRequired={true}
        onConfirm={handleConfirm}
        onCancel={jest.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /confirm action/i });
    expect(submitBtn).toBeDisabled();

    const reasonInput = screen.getByPlaceholderText(/Provide documented reason for audit logs/i);
    fireEvent.change(reasonInput, { target: { value: 'abc' } }); // < 5 chars
    expect(submitBtn).toBeDisabled();

    fireEvent.change(reasonInput, { target: { value: 'Non-payment breach contract' } });
    expect(submitBtn).toBeEnabled();
  });

  it('4. should trigger onCancel when Escape key is pressed', () => {
    const handleCancel = jest.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Test Escape"
        explanation="Test Escape key listener"
        onConfirm={jest.fn()}
        onCancel={handleCancel}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
