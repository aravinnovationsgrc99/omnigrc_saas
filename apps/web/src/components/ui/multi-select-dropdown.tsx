'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Search, Check, X, Loader2 } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

export interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
  id?: string;
}

export function MultiSelectDropdown({
  options,
  selectedValues,
  onChange,
  placeholder = 'Select items...',
  label,
  disabled = false,
  loading = false,
  error = null,
  className = '',
  id: customId,
}: MultiSelectDropdownProps) {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const filteredOptions = options.filter(
    (o) =>
      o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.description && o.description.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const selectAll = () => {
    const selectable = filteredOptions.filter((o) => !o.disabled).map((o) => o.value);
    const combined = Array.from(new Set([...selectedValues, ...selectable]));
    onChange(combined);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={selectId}
        type="button"
        disabled={disabled || loading}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white border rounded-lg transition text-left focus:outline-none focus:ring-2 focus:ring-teal-600 ${
          disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:border-slate-400'
        } ${error ? 'border-red-400 focus:ring-red-500' : 'border-slate-300'}`}
      >
        <div className="flex items-center gap-1.5 truncate flex-1">
          {loading ? (
            <span className="text-slate-400">Loading options...</span>
          ) : selectedValues.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            <span className="font-semibold text-slate-900">
              {selectedValues.length} selected
              <span className="text-slate-400 font-normal ml-1 text-xs">
                (of {options.length})
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {loading && <Loader2 size={14} className="animate-spin text-teal-600" />}
          {selectedValues.length > 0 && !disabled && !loading && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  clearAll();
                }
              }}
              aria-label="Clear all selections"
              title="Clear all"
              className="p-0.5 hover:text-slate-600 rounded"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={15} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {error && <p className="text-[11px] text-red-600 mt-1 font-medium">{error}</p>}

      {/* Popover Dropdown */}
      {isOpen && !disabled && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-80 flex flex-col"
        >
          {/* Header Controls: Search + Select All / Clear */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearchTerm('');
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-slate-500 font-medium text-[11px]">
                {filteredOptions.length} of {options.length} items
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-teal-700 hover:text-teal-900 font-semibold text-[11px]"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-slate-500 hover:text-slate-800 font-semibold text-[11px]"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>

          {/* Options List */}
          <div className="overflow-y-auto omni-scroll p-1 divide-y divide-slate-50">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No items match your search</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedValues.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => toggleOption(opt.value)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg text-left transition ${
                      isSelected
                        ? 'bg-teal-50/70 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {/* Custom Checkbox */}
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                        isSelected
                          ? 'bg-teal-700 border-teal-700 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`truncate ${isSelected ? 'font-semibold text-slate-900' : 'font-medium'}`}>
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.description && (
                        <div className="text-[11px] text-slate-400 truncate mt-0.5 font-normal">
                          {opt.description}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

