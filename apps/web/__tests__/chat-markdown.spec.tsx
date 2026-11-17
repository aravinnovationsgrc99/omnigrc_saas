import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ChatMarkdown, renderInlineMarkdown } from '../src/components/intelligence/chat-markdown';

describe('ChatMarkdown Component Tests', () => {
  it('correctly interprets **bold** notation without rendering asterisks', () => {
    const { container } = render(<ChatMarkdown content="This is **strongly emphasized** text." />);
    const strong = container.querySelector('strong');
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe('strongly emphasized');
    expect(container.textContent).not.toContain('**');
  });

  it('correctly interprets ***bold italic*** notation without rendering asterisks', () => {
    const { container } = render(<ChatMarkdown content="Notice: ***Critical Alert*** requires attention." />);
    const strong = container.querySelector('strong');
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe('Critical Alert');
    expect(strong?.className).toContain('italic');
    expect(container.textContent).not.toContain('***');
  });

  it('correctly interprets *italic* notation without rendering asterisks', () => {
    const { container } = render(<ChatMarkdown content="This is an *italicized* remark." />);
    const em = container.querySelector('em');
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe('italicized');
    expect(container.textContent).not.toContain('*');
  });

  it('correctly parses headers, bullet lists, and code blocks', () => {
    const markdown = [
      '### Key Findings',
      '- First finding on control `AC-1`',
      '- Second finding on audits',
      '```json',
      '{ "status": "ok" }',
      '```',
    ].join('\n');

    const { container } = render(<ChatMarkdown content={markdown} />);
    expect(container.querySelector('h3')?.textContent).toBe('Key Findings');
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('code')?.textContent).toContain('AC-1');
    expect(container.querySelector('pre')).toBeInTheDocument();
  });

  it('renders numbered lists with indexed badges', () => {
    const markdown = [
      '1. Step one',
      '2. Step two',
    ].join('\n');

    const { container } = render(<ChatMarkdown content={markdown} />);
    expect(container.querySelectorAll('ol li').length).toBe(2);
    expect(container.textContent).toContain('Step one');
    expect(container.textContent).toContain('Step two');
  });

  it('renders markdown tables and interprets **bold** within table cells', () => {
    const markdown = [
      '| Property | Value |',
      '| :--- | :--- |',
      '| **Organization** | Acme Corp |',
      '| **Classification** | Internal |',
    ].join('\n');

    const { container } = render(<ChatMarkdown content={markdown} />);
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelectorAll('th').length).toBe(2);
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
    const strongs = container.querySelectorAll('strong');
    expect(strongs.length).toBe(2);
    expect(strongs[0].textContent).toBe('Organization');
    expect(strongs[1].textContent).toBe('Classification');
    expect(container.textContent).not.toContain('**');
  });
});
