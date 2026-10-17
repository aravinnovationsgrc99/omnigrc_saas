import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FloatingSupportChat } from '../src/components/intelligence/floating-support-chat';

// Mock apiRequest
jest.mock('@/lib/api-client', () => ({
  apiRequest: jest.fn().mockImplementation((url: string) => {
    if (url === '/intelligence/questions') {
      return Promise.resolve({
        questions: [
          { key: 'q1', category: 'General', label: 'SOC 2 Overview', prompt: 'Tell me about SOC 2' },
        ],
      });
    }
    return Promise.resolve({});
  }),
}));

describe('FloatingSupportChat Modal Detection & Responsive Positioning', () => {
  let disconnectSpy: jest.SpyInstance;
  let originalMutationObserver: typeof MutationObserver;

  beforeEach(() => {
    // Clear DOM body
    document.body.innerHTML = '';
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it('renders the floating launcher button in default right-bottom position when no modal exists', async () => {
    const { container } = render(<FloatingSupportChat />);
    const launcherWrapper = container.querySelector('[data-floating-support="true"]');
    expect(launcherWrapper).toBeInTheDocument();
    expect(launcherWrapper?.className).toContain('bottom-4 right-4 sm:bottom-6 sm:right-6');
    expect(screen.getByLabelText('Open GRC Intelligence Assistant')).toBeInTheDocument();
  });

  it('detects active modal addition and dynamically shifts launcher to left-bottom on mobile', async () => {
    const { container } = render(<FloatingSupportChat />);
    const launcherWrapper = container.querySelector('[data-floating-support="true"]');
    expect(launcherWrapper?.className).toContain('bottom-4 right-4 sm:bottom-6 sm:right-6');

    // Simulate opening an audit modal dialog
    const modalElement = document.createElement('div');
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');
    modalElement.className = 'fixed inset-0 z-60 bg-slate-900/60';

    await act(async () => {
      document.body.appendChild(modalElement);
    });

    expect(launcherWrapper?.className).toContain('bottom-4 left-4 sm:bottom-6 sm:right-6');
  });

  it('restores default position when active modal is removed from DOM', async () => {
    const modalElement = document.createElement('div');
    modalElement.setAttribute('role', 'dialog');
    modalElement.setAttribute('aria-modal', 'true');
    document.body.appendChild(modalElement);

    const { container } = render(<FloatingSupportChat />);
    const launcherWrapper = container.querySelector('[data-floating-support="true"]');

    expect(launcherWrapper?.className).toContain('bottom-4 left-4 sm:bottom-6 sm:right-6');

    // Remove modal from DOM
    await act(async () => {
      document.body.removeChild(modalElement);
    });

    expect(launcherWrapper?.className).toContain('bottom-4 right-4 sm:bottom-6 sm:right-6');
  });

  it('closes the chat drawer when Escape key is pressed', async () => {
    render(<FloatingSupportChat />);
    const openButton = screen.getByLabelText('Open GRC Intelligence Assistant');

    fireEvent.click(openButton);
    expect(screen.getByLabelText('GRC Intelligence Support Panel')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText('GRC Intelligence Support Panel')).not.toBeInTheDocument();
  });

  it('disconnects MutationObserver upon component unmount to prevent memory leaks', () => {
    const disconnectMock = jest.fn();
    const observeMock = jest.fn();

    class MockMutationObserver {
      observe = observeMock;
      disconnect = disconnectMock;
      takeRecords = jest.fn();
    }

    const originalObserver = global.MutationObserver;
    global.MutationObserver = MockMutationObserver as any;

    try {
      const { unmount } = render(<FloatingSupportChat />);
      expect(observeMock).toHaveBeenCalled();

      unmount();
      expect(disconnectMock).toHaveBeenCalled();
    } finally {
      global.MutationObserver = originalObserver;
    }
  });
});
