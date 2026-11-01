import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScrollNavigator } from './scroll-navigator';

describe('ScrollNavigator Component', () => {
  it('does not render when container has no vertical overflow', () => {
    const mockContainer = {
      current: {
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 500, // No overflow
        scrollTo: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      } as unknown as HTMLElement,
    };

    render(<ScrollNavigator scrollContainerRef={mockContainer} />);
    expect(screen.queryByRole('region', { name: /scroll navigator/i })).not.toBeInTheDocument();
  });

  it('renders and tracks scroll position when container has overflow', () => {
    const scrollToMock = jest.fn();
    const mockContainer = {
      current: {
        scrollTop: 250,
        scrollHeight: 1000,
        clientHeight: 500, // Overflow present (maxScroll = 500)
        scrollTo: scrollToMock,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      } as unknown as HTMLElement,
    };

    render(<ScrollNavigator scrollContainerRef={mockContainer} />);

    const region = screen.getByRole('region', { name: /scroll navigator/i });
    expect(region).toBeInTheDocument();

    const slider = screen.getByRole('slider', { name: /vertical scroll position/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuenow', '50'); // 250 / 500 = 50%

    // Scroll to Top button click
    const topBtn = screen.getByRole('button', { name: /scroll to top/i });
    fireEvent.click(topBtn);
    expect(scrollToMock).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 })
    );

    // Scroll to Bottom button click
    const bottomBtn = screen.getByRole('button', { name: /scroll to bottom/i });
    fireEvent.click(bottomBtn);
    expect(scrollToMock).toHaveBeenCalledWith(
      expect.objectContaining({ top: 500 })
    );
  });
});

