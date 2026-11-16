'use client';

import React from 'react';

export interface ChatMarkdownProps {
  content: string;
  isUser?: boolean;
}

/**
 * Parses inline markdown:
 * - Links: [text](url)
 * - Inline code: `code`
 * - Bold italic: ***text*** or ___text___
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 */
export function renderInlineMarkdown(text: string, isUser = false): React.ReactNode {
  if (!text) return null;

  // Split string using capturing regex
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*\*(?:[^*]|\*(?!\*\*))+\*\*\*|___(?:[^_]|_(?!__))___|\*\*(?:[^*]|\*(?!\*))+\*\*|__(?:[^_]|_(?!_))+__|\*[^*]+\*|_[^_]+_)/g;

  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Link: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isUser
              ? 'underline font-semibold text-white'
              : 'text-slate-900 hover:text-blue-700 underline font-medium'
          }
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Inline code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className={
            isUser
              ? 'px-1.5 py-0.5 text-[11px] font-mono bg-white/20 text-white rounded'
              : 'px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-800 font-medium rounded border border-slate-200'
          }
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold italic: ***text*** or ___text___
    if (
      (part.startsWith('***') && part.endsWith('***') && part.length >= 6) ||
      (part.startsWith('___') && part.endsWith('___') && part.length >= 6)
    ) {
      return (
        <strong
          key={idx}
          className={isUser ? 'font-bold italic text-white' : 'font-bold italic text-slate-900'}
        >
          {part.slice(3, -3)}
        </strong>
      );
    }

    // Bold: **text** or __text__
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong
          key={idx}
          className={isUser ? 'font-bold text-white' : 'font-semibold text-slate-900'}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *text* or _text_
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={idx} className={isUser ? 'italic text-white/90' : 'italic text-slate-800'}>
          {part.slice(1, -1)}
        </em>
      );
    }

    return part;
  });
}

/**
 * Lightweight React Markdown renderer with zero external dependencies.
 * Interprets headers, lists, code blocks, blockquotes, horizontal rules, and inline styling.
 */
export function ChatMarkdown({ content, isUser = false }: ChatMarkdownProps) {
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(' ');
      elements.push(
        <p key={`p-${elements.length}`} className="leading-relaxed">
          {renderInlineMarkdown(text, isUser)}
        </p>
      );
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentList) {
      const listKey = `list-${elements.length}`;
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={listKey} className="space-y-1 my-1.5 ml-0.5">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                    isUser ? 'bg-white/80' : 'bg-slate-600'
                  }`}
                />
                <span className="flex-1 leading-relaxed">{renderInlineMarkdown(item, isUser)}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={listKey} className="space-y-1 my-1.5 ml-0.5">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded flex-shrink-0 mt-0.5 ${
                    isUser
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {idx + 1}.
                </span>
                <span className="flex-1 leading-relaxed">{renderInlineMarkdown(item, isUser)}</span>
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block toggle
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        elements.push(
          <pre
            key={`code-${elements.length}`}
            className="p-2.5 my-2 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800"
          >
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        flushParagraph();
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Blank line
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      flushParagraph();
      flushList();
      elements.push(
        <hr
          key={`hr-${elements.length}`}
          className={`my-2 ${isUser ? 'border-white/20' : 'border-slate-200'}`}
        />
      );
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      if (level === 1) {
        elements.push(
          <h1
            key={`h1-${elements.length}`}
            className={`text-sm font-extrabold mt-2 mb-1 ${isUser ? 'text-white' : 'text-slate-900'}`}
          >
            {renderInlineMarkdown(headingText, isUser)}
          </h1>
        );
      } else if (level === 2) {
        elements.push(
          <h2
            key={`h2-${elements.length}`}
            className={`text-xs font-bold mt-2 mb-1 pb-0.5 border-b ${
              isUser ? 'text-white border-white/20' : 'text-slate-900 border-slate-100'
            }`}
          >
            {renderInlineMarkdown(headingText, isUser)}
          </h2>
        );
      } else {
        elements.push(
          <h3
            key={`h3-${elements.length}`}
            className={`text-xs font-bold mt-1.5 mb-0.5 ${isUser ? 'text-white' : 'text-slate-800'}`}
          >
            {renderInlineMarkdown(headingText, isUser)}
          </h3>
        );
      }
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      const quoteText = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          className={`border-l-2 pl-2.5 py-1 my-1.5 text-[11px] italic rounded-r ${
            isUser
              ? 'border-white/60 bg-white/10 text-white/90'
              : 'border-slate-400 bg-slate-50 text-slate-700'
          }`}
        >
          {renderInlineMarkdown(quoteText, isUser)}
        </blockquote>
      );
      continue;
    }

    // Bullet list item (*, -, •)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Numbered list item (1., 2., etc.)
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numberedMatch[2]);
      continue;
    }

    // Regular line - add to current paragraph
    currentParagraph.push(trimmed);
  }

  // Flush remaining
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre
        key={`code-${elements.length}`}
        className="p-2.5 my-2 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800"
      >
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }
  flushParagraph();
  flushList();

  return <div className="space-y-1.5 break-words text-xs">{elements}</div>;
}
