'use client';

import React, { useState, useEffect } from 'react';
import { PolicyCategoryDto, Role } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { useAuth } from '@/context/auth-context';
import {
  FileCheck,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Check,
  X,
  RefreshCw,
  FolderKanban,
  Info,
} from 'lucide-react';
import { SkeletonLine } from '@/components/ui/skeleton';
import { InlineErrorState } from '@/components/ui/inline-error-state';

/**
 * PolicyCategoriesSettingsCard
 * Standardized governance classifications for organization policies.
 *
 * PERSISTENCE LIMITATION NOTE:
 * Unused custom categories currently rely on backend in-memory state and may reset upon server restart.
 * Categories referenced by at least one active policy remain dynamically persistent via policy table queries.
 * A durable PolicyCategory database table requires a formal schema migration and will be introduced in an authorized future release.
 */
export function PolicyCategoriesSettingsCard() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [categories, setCategories] = useState<PolicyCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Category
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  // Rename Category
  const [renamingCategory, setRenamingCategory] = useState<PolicyCategoryDto | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  // Delete Blocker / Confirmation Modal
  const [categoryToDelete, setCategoryToDelete] = useState<PolicyCategoryDto | null>(null);
  const [deletingCategory, setDeletingCategory] = useState(false);

  const isAdmin = user?.role === Role.ADMIN || user?.role === Role.MSSP_ADMIN;

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<PolicyCategoryDto[]>('/policies/categories');
      setCategories(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load policy categories');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    setAddingCategory(true);
    try {
      await apiRequest('/policies/categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      addToast(`Category "${trimmed}" registered successfully.`, 'success');
      setNewCategoryName('');
      setShowAddForm(false);
      fetchCategories();
    } catch (err: any) {
      addToast(`Failed to create category: ${err.message}`, 'error');
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renamingCategory) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renamingCategory.name) {
      setRenamingCategory(null);
      return;
    }

    setSavingRename(true);
    try {
      await apiRequest(`/policies/categories/${encodeURIComponent(renamingCategory.name)}`, {
        method: 'PATCH',
        body: JSON.stringify({ newName: trimmed }),
      });
      addToast(`Category renamed to "${trimmed}" across all tenant policies.`, 'success');
      setRenamingCategory(null);
      fetchCategories();
    } catch (err: any) {
      addToast(`Failed to rename category: ${err.message}`, 'error');
    } finally {
      setSavingRename(false);
    }
  }

  async function handleDelete() {
    if (!categoryToDelete) return;

    if (categoryToDelete.isDefault) {
      addToast('System default categories cannot be removed.', 'error');
      setCategoryToDelete(null);
      return;
    }

    if (categoryToDelete.policyCount > 0) {
      addToast(
        `Cannot delete "${categoryToDelete.name}". It is assigned to ${categoryToDelete.policyCount} active policy/policies.`,
        'error',
      );
      return;
    }

    setDeletingCategory(true);
    try {
      await apiRequest(`/policies/categories/${encodeURIComponent(categoryToDelete.name)}`, {
        method: 'DELETE',
      });
      addToast(`Category "${categoryToDelete.name}" deleted successfully.`, 'success');
      setCategoryToDelete(null);
      fetchCategories();
    } catch (err: any) {
      addToast(`Deletion blocked: ${err.message}`, 'error');
    } finally {
      setDeletingCategory(false);
    }
  }

  return (
    <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-[#1B2430] flex items-center gap-2">
            <FolderKanban size={16} className="text-teal-700" /> Policy Governance & Categories
          </h2>
          <p className="text-xs text-[#5B6672] mt-0.5">
            Manage standardized classifications for policies and governance documents across your organization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCategories}
            className="omni-btn-ghost text-xs h-7 px-2 flex items-center gap-1 text-slate-600 hover:text-slate-900"
            title="Refresh categories"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && !showAddForm && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setNewCategoryName('');
              }}
              className="omni-btn-ghost text-xs h-7 px-2.5 flex items-center gap-1.5 text-teal-700 hover:bg-teal-50"
            >
              <Plus size={13} /> Add Category
            </button>
          )}
        </div>
      </div>

      {/* Add Category Inline Form */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-slate-50 border border-teal-100 rounded-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              autoFocus
              placeholder="e.g. Threat Intelligence & SecOps"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              disabled={addingCategory}
              className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              disabled={addingCategory}
              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingCategory || !newCategoryName.trim()}
              className="px-3 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded disabled:opacity-50 flex items-center gap-1"
            >
              {addingCategory ? 'Adding...' : 'Save Category'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2 py-2">
          <SkeletonLine height="24px" width="100%" />
          <SkeletonLine height="24px" width="100%" />
          <SkeletonLine height="24px" width="100%" />
        </div>
      ) : error ? (
        <InlineErrorState message={error} onRetry={fetchCategories} />
      ) : categories.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-500 bg-slate-50 border border-dashed rounded-lg">
          No policy categories configured. Click "Add Category" to initialize.
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#EDEFED] rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#EDEFED] bg-[#FAFBFB] text-[#5B6672] font-semibold">
                <th className="py-2.5 px-3">Category Name</th>
                <th className="py-2.5 px-3">Scope / Type</th>
                <th className="py-2.5 px-3">Assigned Policies</th>
                {isAdmin && <th className="py-2.5 px-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEFED]">
              {categories.map((cat) => (
                <tr key={cat.id || cat.name} className="hover:bg-[#FAFBFB] transition-colors">
                  <td className="py-2.5 px-3 font-medium text-[#1B2430]">
                    {renamingCategory?.name === cat.name ? (
                      <form onSubmit={handleRename} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                          disabled={savingRename}
                          className="h-7 px-2 text-xs border border-teal-600 rounded focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={savingRename || !renameValue.trim()}
                          className="p-1 text-teal-700 hover:bg-teal-50 rounded"
                          title="Save Rename"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingCategory(null)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <span>{cat.name}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`omni-badge ${
                        cat.isDefault ? 'bg-slate-100 text-slate-700 border-slate-200' : 'omni-badge-teal'
                      }`}
                    >
                      {cat.isDefault ? 'SYSTEM DEFAULT' : 'CUSTOM'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    <span className="font-semibold text-slate-900">{cat.policyCount}</span> active policies
                  </td>
                  {isAdmin && (
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setRenamingCategory(cat);
                            setRenameValue(cat.name);
                          }}
                          className="p-1 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded transition-colors"
                          title="Rename Category"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => {
                            if (cat.isDefault) return;
                            setCategoryToDelete(cat);
                          }}
                          disabled={cat.isDefault}
                          className={`p-1 rounded transition-colors ${
                            cat.isDefault
                              ? 'text-slate-300 opacity-40 cursor-not-allowed'
                              : cat.policyCount > 0
                              ? 'text-slate-300 hover:text-amber-700 hover:bg-amber-50 cursor-pointer'
                              : 'text-slate-500 hover:text-rose-700 hover:bg-rose-50'
                          }`}
                          title={
                            cat.isDefault
                              ? 'System default categories cannot be removed'
                              : cat.policyCount > 0
                              ? `Assigned to ${cat.policyCount} policies (deletion blocked)`
                              : 'Delete Category'
                          }
                          aria-label={
                            cat.isDefault
                              ? 'System default categories cannot be removed'
                              : cat.policyCount > 0
                              ? `Assigned to ${cat.policyCount} policies (deletion blocked)`
                              : `Delete ${cat.name}`
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Informational footnote on retention and persistence */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#5B6672]">
        <Info size={13} className="text-slate-400 shrink-0" />
        <span>System default categories are permanently retained. Custom categories with assigned policies persist across sessions.</span>
      </div>

      {/* Delete / Blocker Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            {categoryToDelete.isDefault ? (
              <div>
                <div className="flex items-center gap-3 text-slate-600 mb-3">
                  <div className="p-2 bg-slate-100 rounded-full">
                    <Info size={20} />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">System Default Category</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  The category <strong className="text-slate-900 font-semibold">"{categoryToDelete.name}"</strong> is a built-in system default and cannot be removed.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setCategoryToDelete(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Understood
                  </button>
                </div>
              </div>
            ) : categoryToDelete.policyCount > 0 ? (
              <div>
                <div className="flex items-center gap-3 text-amber-600 mb-3">
                  <div className="p-2 bg-amber-100 rounded-full">
                    <AlertTriangle size={20} />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">Deletion Blocked</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  The category <strong className="text-slate-900 font-semibold">"{categoryToDelete.name}"</strong> cannot be deleted because it is actively assigned to{' '}
                  <strong className="text-amber-700 font-semibold">{categoryToDelete.policyCount} policy/policies</strong>.
                </p>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 mb-5">
                  <strong>Required Next Action:</strong> Please open the Policy Management tab and reassign or archive the policies referencing this category before deleting it.
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setCategoryToDelete(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Understood
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 text-rose-600 mb-3">
                  <div className="p-2 bg-rose-100 rounded-full">
                    <Trash2 size={20} />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">Confirm Category Deletion</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  Are you sure you want to remove the category <strong className="text-slate-900">"{categoryToDelete.name}"</strong>? This category is currently unassigned (0 active policies) and can be safely removed.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setCategoryToDelete(null)}
                    disabled={deletingCategory}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deletingCategory}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                  >
                    {deletingCategory ? 'Deleting...' : 'Delete Category'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
