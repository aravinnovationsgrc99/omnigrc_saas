'use client';

import React, { useState, useRef } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Eye,
  Edit3,
  Columns,
  Upload,
  Download,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { useToast } from '@/context/toast-context';

interface PolicyEditorProps {
  content: string;
  onChange: (value: string) => void;
  documentTitle?: string;
  readOnly?: boolean;
}

export function PolicyEditor({
  content,
  onChange,
  documentTitle = 'policy-document',
  readOnly = false,
}: PolicyEditorProps) {
  const { addToast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<'write' | 'preview' | 'split'>('write');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingImportContent, setPendingImportContent] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [pendingFileSize, setPendingFileSize] = useState<number>(0);

  // Helper to insert formatting at cursor or around selected text
  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (readOnly) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const replacement = `${prefix}${selectedText || 'text'}${suffix}`;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    onChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selectedText ? selectedText.length : 4),
      );
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    if (readOnly) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart);
    onChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  // Safe file import (.md / .txt, max 2MB)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    e.target.value = '';

    const validExtensions = ['.md', '.txt', '.markdown'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExt) {
      addToast('Only Markdown (.md) and Plain Text (.txt) files are currently supported for safe policy import.', 'error');
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      addToast(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum limit of 2MB.`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (typeof text === 'string') {
        setPendingImportContent(text);
        setPendingFileName(file.name);
        setPendingFileSize(file.size);
        setImportModalOpen(true);
      }
    };
    reader.onerror = () => {
      addToast('Failed to read document file.', 'error');
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (pendingImportContent !== null) {
      onChange(pendingImportContent);
      addToast(`Imported ${pendingFileName} successfully.`, 'success');
    }
    setImportModalOpen(false);
    setPendingImportContent(null);
  };

  // Safe Markdown Export
  const handleExport = () => {
    if (!content.trim()) {
      addToast('Document content is empty.', 'error');
      return;
    }

    const cleanTitle = documentTitle
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle || 'policy'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast('Policy draft exported as Markdown (.md).', 'success');
  };

  // Safe render of basic markdown to react elements without dangerous innerHTML
  const renderFormattedPreview = (markdown: string) => {
    const lines = markdown.split('\n');
    let inCodeBlock = false;
    let codeBuffer: string[] = [];

    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // end of code block
          elements.push(
            <pre key={`code-${index}`} className="p-3 my-2 bg-slate-900 text-slate-100 rounded text-xs font-mono overflow-x-auto">
              <code>{codeBuffer.join('\n')}</code>
            </pre>,
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        elements.push(<div key={`sp-${index}`} className="h-2" />);
        return;
      }

      if (trimmed.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${index}`} className="text-xl font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-200">
            {trimmed.slice(2)}
          </h1>,
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h2 key={`h2-${index}`} className="text-base font-bold text-slate-800 mt-3 mb-1.5 pb-0.5 border-b border-slate-100">
            {trimmed.slice(3)}
          </h2>,
        );
      } else if (trimmed.startsWith('### ')) {
        elements.push(
          <h3 key={`h3-${index}`} className="text-sm font-semibold text-slate-800 mt-2 mb-1">
            {trimmed.slice(4)}
          </h3>,
        );
      } else if (trimmed === '---' || trimmed === '***') {
        elements.push(<hr key={`hr-${index}`} className="my-3 border-slate-200" />);
      } else if (trimmed.startsWith('> ')) {
        elements.push(
          <blockquote key={`bq-${index}`} className="border-l-4 border-teal-600 pl-3 py-1 my-2 bg-teal-50/50 text-xs text-slate-700 italic rounded-r">
            {trimmed.slice(2)}
          </blockquote>,
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(
          <div key={`li-${index}`} className="flex items-start gap-2 text-xs text-slate-700 my-0.5 ml-2">
            <span className="text-teal-700 font-bold">•</span>
            <span>{trimmed.slice(2)}</span>
          </div>,
        );
      } else if (/^\d+\.\s/.test(trimmed)) {
        const num = trimmed.match(/^\d+\./)?.[0] || '1.';
        const rest = trimmed.replace(/^\d+\.\s*/, '');
        elements.push(
          <div key={`ol-${index}`} className="flex items-start gap-2 text-xs text-slate-700 my-0.5 ml-2">
            <span className="font-semibold text-slate-900 font-mono text-[11px] min-w-[18px]">{num}</span>
            <span>{rest}</span>
          </div>,
        );
      } else {
        elements.push(
          <p key={`p-${index}`} className="text-xs text-slate-700 leading-relaxed my-1">
            {trimmed}
          </p>,
        );
      }
    });

    if (inCodeBlock && codeBuffer.length > 0) {
      elements.push(
        <pre key="code-final" className="p-3 my-2 bg-slate-900 text-slate-100 rounded text-xs font-mono overflow-x-auto">
          <code>{codeBuffer.join('\n')}</code>
        </pre>,
      );
    }

    return elements;
  };

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm flex flex-col">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,.markdown"
        onChange={handleFileSelected}
        className="hidden"
        aria-hidden="true"
      />

      {/* Editor Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 select-none">
        {/* Formatting Actions */}
        {!readOnly && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => insertLinePrefix('# ')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Heading 1"
              aria-label="Insert Heading 1"
            >
              <Heading1 size={15} />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('## ')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Heading 2"
              aria-label="Insert Heading 2"
            >
              <Heading2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('### ')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Heading 3"
              aria-label="Insert Heading 3"
            >
              <Heading3 size={15} />
            </button>
            <div className="h-4 w-px bg-slate-300 mx-1" />
            <button
              type="button"
              onClick={() => insertFormatting('**', '**')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Bold"
              aria-label="Format Bold"
            >
              <Bold size={15} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('*', '*')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Italic"
              aria-label="Format Italic"
            >
              <Italic size={15} />
            </button>
            <div className="h-4 w-px bg-slate-300 mx-1" />
            <button
              type="button"
              onClick={() => insertLinePrefix('- ')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Bullet List"
              aria-label="Insert Bullet List"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('1. ')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Numbered List"
              aria-label="Insert Numbered List"
            >
              <ListOrdered size={15} />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('> ')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Blockquote"
              aria-label="Insert Blockquote"
            >
              <Quote size={15} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('`', '`')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Inline Code"
              aria-label="Insert Code"
            >
              <Code size={15} />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('---\n')}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-700 hover:text-slate-900"
              title="Horizontal Divider"
              aria-label="Insert Horizontal Rule"
            >
              <Minus size={15} />
            </button>
          </div>
        )}

        {/* View Mode & Document Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Document Import/Export */}
          <div className="flex items-center gap-1 border-r border-slate-300 pr-2">
            {!readOnly && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 rounded flex items-center gap-1"
                title="Import Markdown or Plain Text document"
              >
                <Upload size={13} className="text-teal-700" />
                <span className="hidden sm:inline">Import</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              className="px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 rounded flex items-center gap-1"
              title="Export content as Markdown (.md) file"
            >
              <Download size={13} className="text-teal-700" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>

          {/* View Toggles */}
          <div className="flex items-center bg-slate-200 p-0.5 rounded text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('write')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                viewMode === 'write' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Edit3 size={12} />
              <span>Write</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                viewMode === 'preview' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye size={12} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`hidden md:flex px-2 py-0.5 rounded items-center gap-1 transition-colors ${
                viewMode === 'split' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns size={12} />
              <span>Split</span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 min-h-[280px]">
        {/* Write Pane */}
        {(viewMode === 'write' || viewMode === 'split') && (
          <div className={`p-3 ${viewMode === 'write' ? 'md:col-span-2' : ''}`}>
            <textarea
              ref={textareaRef}
              rows={12}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              readOnly={readOnly}
              placeholder="# Policy Title&#10;&#10;1. Objective & Purpose&#10;2. Policy Scope&#10;3. Compliance Rules and Controls..."
              className="w-full h-full min-h-[260px] p-2 text-xs omni-mono text-slate-800 bg-white border-0 focus:outline-none resize-y"
              aria-label="Policy Content Editor"
            />
          </div>
        )}

        {/* Preview Pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            className={`p-4 bg-slate-50/60 overflow-y-auto max-h-[460px] ${
              viewMode === 'preview' ? 'md:col-span-2' : ''
            }`}
          >
            {content.trim() ? (
              <div className="space-y-1">{renderFormattedPreview(content)}</div>
            ) : (
              <div className="text-center py-10 text-xs text-slate-400 italic">
                Policy document is currently empty. Switch to "Write" to start authoring.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import Confirmation Preview Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-xl w-full p-5 shadow-xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 mb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Review Imported Policy Content</h3>
                <p className="text-xs text-slate-500">
                  File: <span className="font-semibold text-slate-800">{pendingFileName}</span> ({(pendingFileSize / 1024).toFixed(1)} KB)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 mb-3 flex items-start gap-2">
              <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
              <span>
                Applying this imported content will replace the current draft in the editor. Please verify the content below before confirming.
              </span>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded p-3 bg-slate-50 text-xs font-mono whitespace-pre-wrap max-h-60 mb-4">
              {pendingImportContent}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmImport}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5"
              >
                <Check size={14} /> Apply to Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
