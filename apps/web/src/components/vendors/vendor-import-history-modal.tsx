'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  VendorImportBatchDto,
  PaginatedVendorImportBatchesDto,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';

interface VendorImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VendorImportHistoryModal({
  isOpen,
  onClose,
}: VendorImportHistoryModalProps) {
  const { addToast } = useToast();
  const [batches, setBatches] = useState<VendorImportBatchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<VendorImportBatchDto | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchBatches();
    }
  }, [isOpen]);

  async function fetchBatches() {
    setLoading(true);
    try {
      const res = await apiRequest<PaginatedVendorImportBatchesDto>('/vendors/import/batches');
      setBatches(res.items || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load import batches.', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Vendor Import History & Audit Trail</h2>
              <p className="text-xs text-slate-500">
                Audit records of past Excel and CSV vendor batch ingestions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-teal-700" />
              Loading import history...
            </div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No vendor batch imports recorded for this organization yet.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">File Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-center">Total</th>
                    <th className="py-2.5 px-3 text-center">Created</th>
                    <th className="py-2.5 px-3 text-center">Updated</th>
                    <th className="py-2.5 px-3 text-center">Skipped</th>
                    <th className="py-2.5 px-3 text-center">Errors</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {batches.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBatch(b)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {new Date(b.createdAt).toLocaleDateString()}{' '}
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{b.fileName}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {b.fileType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">{b.totalRows}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-bold">{b.importedRows}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-blue-700 font-bold">{b.updatedRows}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-amber-700 font-bold">{b.skippedRows}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-rose-700 font-bold">{b.errorRows}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : b.status === 'FAILED'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Batch Error Inspector Drawer / Panel */}
          {selectedBatch && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Batch Details: {selectedBatch.fileName}
                </span>
                <button
                  onClick={() => setSelectedBatch(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Close Details
                </button>
              </div>

              {selectedBatch.errorLog && Array.isArray(selectedBatch.errorLog) && selectedBatch.errorLog.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedBatch.errorLog.map((err: any, idx: number) => (
                    <div key={idx} className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start gap-2">
                      <span className="font-mono text-rose-600 shrink-0">Row {err.rowNumber}:</span>
                      <span>{err.error}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No row-level errors recorded for this batch. All valid rows were processed.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg shadow-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

