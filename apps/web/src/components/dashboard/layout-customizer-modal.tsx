'use client';

import React, { useState } from 'react';
import { WidgetLayoutItem, DEFAULT_WIDGET_LAYOUT } from '@omnigrc/shared';
import { WIDGET_METADATA } from './widget-registry';
import { X, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw, Check } from 'lucide-react';

interface LayoutCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLayout: WidgetLayoutItem[];
  onSave: (newLayout: WidgetLayoutItem[]) => Promise<void>;
}

export function LayoutCustomizerModal({
  isOpen,
  onClose,
  currentLayout,
  onSave,
}: LayoutCustomizerModalProps) {
  const [layout, setLayout] = useState<WidgetLayoutItem[]>(currentLayout);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleVisibility = (id: string) => {
    setLayout((prev) =>
      prev.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item)),
    );
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= layout.length) return;

    const copy = [...layout];
    const temp = copy[index];
    copy[index] = copy[newIndex];
    copy[newIndex] = temp;

    // Re-index position
    setLayout(copy.map((item, pos) => ({ ...item, position: pos })));
  };

  const handleReset = () => {
    setLayout(DEFAULT_WIDGET_LAYOUT);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(layout);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save widget layout preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] omni-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Customize Dashboard Widgets</h2>
            <p className="text-xs text-slate-500">Reorder or hide widgets to tailor your view</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-2 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium mb-3">
              {error}
            </div>
          )}

          {layout.map((item, index) => {
            const meta = WIDGET_METADATA[item.id];
            const Icon = meta?.icon;

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  item.visible
                    ? 'bg-white border-slate-200 shadow-2xs'
                    : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${item.visible ? 'bg-teal-50 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
                    {Icon ? <Icon size={16} /> : null}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-900 block">
                      {meta?.title || item.id}
                    </span>
                    <span className="text-xs text-slate-500 block">
                      {meta?.category || 'Widget'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Move Up / Down */}
                  <button
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 rounded hover:bg-slate-100"
                    title="Move up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === layout.length - 1}
                    className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 rounded hover:bg-slate-100"
                    title="Move down"
                  >
                    <ChevronDown size={16} />
                  </button>

                  <div className="w-px h-5 bg-slate-200 mx-1" />

                  {/* Toggle Visibility */}
                  <button
                    onClick={() => toggleVisibility(item.id)}
                    className={`p-1.5 rounded transition-colors ${
                      item.visible
                        ? 'text-teal-700 hover:bg-teal-50'
                        : 'text-slate-400 hover:bg-slate-200/60'
                    }`}
                    title={item.visible ? 'Hide widget' : 'Show widget'}
                  >
                    {item.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <RotateCcw size={14} /> Reset Defaults
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check size={14} /> {saving ? 'Saving...' : 'Save Layout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
