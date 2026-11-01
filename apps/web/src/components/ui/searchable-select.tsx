'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Search, Check, X, Loader2 } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  clearable?: boolean;
  className?: string;
  id?: string;
  label?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  disabled = false,
  loading = false,
  error = null,
  clearable = false,
  className = '',
  id: customId,
  label,
}: SearchableSelectProps) {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

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

  // Focus search input on open
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

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
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
        <span className={`truncate flex-1 ${!selectedOption ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
          {loading ? 'Loading...' : selectedOption ? selectedOption.label : placeholder}
        </span>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {loading && <Loader2 size={14} className="animate-spin text-teal-600" />}
          {clearable && value && !disabled && !loading && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleClear(e as any);
              }}
              aria-label="Clear selection"
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
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-72 flex flex-col"
        >
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
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
          </div>

          {/* Options List */}
          <div className="overflow-y-auto omni-scroll p-1 divide-y divide-slate-50">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No results found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg text-left transition ${
                      isSelected
                        ? 'bg-teal-50 text-teal-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{opt.label}</span>
                        {opt.badge && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-normal">
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
                    {isSelected && <Check size={14} className="text-teal-700 shrink-0" />}
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

