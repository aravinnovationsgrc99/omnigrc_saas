'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/context/toast-context';
import { apiRequest } from '@/lib/api-client';
import { InvitationDto, InvitationStatus, Role } from '@omnigrc/shared';
import { Users, Mail, Plus, RotateCw, XCircle, ShieldAlert, CheckCircle2, Clock, Shield, Lock, Link, Copy, Check, AlertCircle } from 'lucide-react';
import { SkeletonLine } from '@/components/ui/skeleton';

export function TeamInvitationsView() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === Role.ADMIN;

  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Copy Link Confirmation Modal State
  const [confirmCopyTarget, setConfirmCopyTarget] = useState<{ id: string; email: string } | null>(null);

  // New Invite Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>(Role.ANALYST);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Action Loading States
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<InvitationDto[]>('/auth/invitations');
      setInvitations(data);
    } catch {
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [isAdmin]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || sendingInvite) return;

    setSendingInvite(true);
    setModalError(null);
    setCreatedInviteUrl(null);

    try {
      const newInv = await apiRequest<InvitationDto>('/auth/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      setInvitations((prev) => [newInv, ...prev]);
      if (newInv.inviteUrl) {
        setCreatedInviteUrl(newInv.inviteUrl);
      }
      addToast(`Invitation created for ${newInv.email}`, 'success');
    } catch (err: any) {
      setModalError(err.message || 'Failed to dispatch invitation.');
      addToast(err.message || 'Failed to dispatch invitation.', 'error');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleConfirmCopyLink = async () => {
    if (!confirmCopyTarget) return;
    const { id: invitationId, email } = confirmCopyTarget;
    setConfirmCopyTarget(null);
    setActioningId(invitationId);

    try {
      const res = await apiRequest<InvitationDto>(`/auth/invitations/${invitationId}/copy-link`, {
        method: 'POST',
      });

      if (res.inviteUrl) {
        await navigator.clipboard.writeText(res.inviteUrl);
        addToast(`Generated fresh token & copied link for ${email} to clipboard!`, 'success');
      } else {
        addToast('Failed to generate invite URL.', 'error');
      }

      fetchInvitations();
    } catch (err: any) {
      addToast(err.message || 'Failed to copy invitation link', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleResend = async (invitationId: string, email: string) => {
    setActioningId(invitationId);
    try {
      const updatedInv = await apiRequest<InvitationDto>(`/auth/invitations/${invitationId}/resend`, {
        method: 'POST',
      });

      setInvitations((prev) => prev.map((inv) => (inv.id === invitationId ? updatedInv : inv)));
      addToast(`Resent invitation email to ${email}`, 'success');
      fetchInvitations();
    } catch (err: any) {
      addToast(err.message || 'Failed to resend invitation', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleRevoke = async (invitationId: string, email: string) => {
    setActioningId(invitationId);
    try {
      await apiRequest(`/auth/invitations/${invitationId}/revoke`, {
        method: 'POST',
      });

      setInvitations((prev) =>
        prev.map((inv) =>
          inv.id === invitationId
            ? { ...inv, status: InvitationStatus.REVOKED, revokedAt: new Date().toISOString() }
            : inv,
        ),
      );
      addToast(`Revoked invitation for ${email}`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to revoke invitation', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const getStatusBadge = (status: InvitationStatus) => {
    switch (status) {
      case InvitationStatus.PENDING:
        return <span className="omni-badge omni-badge-teal">PENDING</span>;
      case InvitationStatus.ACCEPTED:
        return <span className="omni-badge bg-emerald-100 text-emerald-800 border-emerald-300">ACCEPTED</span>;
      case InvitationStatus.EXPIRED:
        return <span className="omni-badge omni-badge-rose">EXPIRED</span>;
      case InvitationStatus.REVOKED:
        return <span className="omni-badge bg-gray-100 text-gray-600 border-gray-300">REVOKED</span>;
      default:
        return <span className="omni-badge">{status}</span>;
    }
  };

  return (
    <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 mb-5 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-sm font-semibold text-[#1B2430] flex items-center gap-2">
            <Users size={16} className="text-teal-700" /> Team & Secure Invitations
          </h2>
          <p className="text-xs text-[#5B6672] mt-0.5">
            Manage organization members, issue secure token invitations, and copy manual delivery links
          </p>
        </div>
        {isAdmin ? (
          <button
            onClick={() => {
              setShowInviteModal(true);
              setModalError(null);
              setCreatedInviteUrl(null);
              setInviteEmail('');
            }}
            className="omni-btn-primary text-xs h-8 px-3 flex items-center gap-1.5"
          >
            <Plus size={14} /> Invite Team Member
          </button>
        ) : (
          <span className="text-[11px] text-[#8493A5] flex items-center gap-1 bg-[#FAFBFB] px-2 py-1 rounded border border-[#E2E6E4]">
            <Lock size={12} /> Read-only (ANALYST)
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 py-2">
          <SkeletonLine height="28px" width="100%" />
          <SkeletonLine height="28px" width="100%" />
        </div>
      ) : invitations.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-[#EDEFED] rounded-lg bg-[#FAFBFB]">
          <Mail size={24} className="mx-auto text-gray-400 mb-2" />
          <p className="text-xs text-[#5B6672]">No pending or historical invitations found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#EDEFED] bg-[#FAFBFB] text-[#5B6672] font-semibold">
                <th className="py-2.5 px-3">Invited Email</th>
                <th className="py-2.5 px-3">Assigned Role</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Expires At</th>
                {isAdmin && <th className="py-2.5 px-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => {
                const isPending = inv.status === InvitationStatus.PENDING;
                const isActioning = actioningId === inv.id;

                return (
                  <tr key={inv.id} className="border-b border-[#EDEFED] hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-medium text-[#1B2430]">
                      <div className="flex items-center gap-1.5">
                        <Mail size={13} className="text-slate-400" />
                        <span>{inv.email}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="omni-mono text-[11px] bg-[#EDEFED] px-1.5 py-0.5 rounded text-slate-800">
                        {inv.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">{getStatusBadge(inv.status)}</td>
                    <td className="py-2.5 px-3 text-[#5B6672] omni-mono text-[11px]">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-3 text-right">
                        {isPending ? (
                          <div className="flex justify-end items-center gap-1.5">
                            <button
                              onClick={() => setConfirmCopyTarget({ id: inv.id, email: inv.email })}
                              disabled={isActioning}
                              className="omni-btn-ghost text-[11.5px] py-1 px-2 flex items-center gap-1 text-slate-700 hover:text-teal-700"
                              title="Rotate token & copy manual delivery link (WhatsApp/Slack/Teams/SMS)"
                            >
                              <Link size={12} className={isActioning ? 'animate-spin' : ''} />
                              <span>Copy Link</span>
                            </button>
                            <button
                              onClick={() => handleResend(inv.id, inv.email)}
                              disabled={isActioning}
                              className="omni-btn-ghost text-[11.5px] py-1 px-2 flex items-center gap-1 text-teal-700 hover:text-teal-800"
                              title="Resend invitation email with new token"
                            >
                              <RotateCw size={12} className={isActioning ? 'animate-spin' : ''} />
                              <span>Resend</span>
                            </button>
                            <button
                              onClick={() => handleRevoke(inv.id, inv.email)}
                              disabled={isActioning}
                              className="omni-btn-ghost text-[11.5px] py-1 px-2 flex items-center gap-1 text-red-600 hover:text-red-700"
                              title="Revoke invitation token"
                            >
                              <XCircle size={12} />
                              <span>Cancel</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">No actions</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Copy Link Token Rotation Confirmation Modal */}
      {confirmCopyTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="omni-fade-in bg-white rounded-xl w-full max-w-md p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <AlertCircle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Generate Fresh Invite Link?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Target recipient: <span className="font-semibold text-slate-800">{confirmCopyTarget.email}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 p-3.5 rounded-xl mb-5">
              Generate a new invitation link? <strong>The previous link will no longer work.</strong> A fresh secure token will be issued, and the new URL will be copied to your clipboard.
            </p>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setConfirmCopyTarget(null)}
                className="omni-btn-ghost text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCopyLink}
                className="omni-btn-primary text-xs px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold"
              >
                Generate & Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Team Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="omni-fade-in bg-white rounded-xl w-full max-w-md p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Mail size={20} className="text-teal-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Invite Team Member</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sends email and generates manual delivery link
                </p>
              </div>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs mb-4 flex items-center gap-2">
                <ShieldAlert size={16} className="shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {createdInviteUrl ? (
              <div className="space-y-4">
                <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl text-xs space-y-2 text-teal-900">
                  <div className="flex items-center gap-1.5 font-bold text-teal-800">
                    <CheckCircle2 size={16} /> Invitation Successfully Created!
                  </div>
                  <p className="text-[#5B6672]">
                    An email has been dispatched (if mailer is active). You can also copy the manual delivery link below to share via WhatsApp, Slack, Teams, or SMS:
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-teal-300 p-2 rounded-lg mt-2">
                    <input
                      type="text"
                      readOnly
                      value={createdInviteUrl}
                      className="omni-mono text-[11px] text-slate-800 flex-1 outline-none truncate border-none bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteUrl);
                        setCopiedSuccess(true);
                        addToast('Invite URL copied to clipboard!', 'success');
                        setTimeout(() => setCopiedSuccess(false), 2000);
                      }}
                      className="omni-btn-primary text-xs py-1 px-2.5 flex items-center gap-1 bg-teal-700 hover:bg-teal-800"
                    >
                      {copiedSuccess ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedSuccess ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setCreatedInviteUrl(null);
                    }}
                    className="omni-btn-ghost text-xs px-4 py-2"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1B2430] mb-1">
                    Recipient Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="analyst@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="omni-input w-full text-xs h-9"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1B2430] mb-1">Assigned Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="omni-input w-full text-xs h-9 bg-white cursor-pointer"
                  >
                    <option value={Role.ANALYST}>ANALYST (Standard View & Operations)</option>
                    <option value={Role.ADMIN}>ADMIN (Full Governance & Settings Control)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="omni-btn-ghost text-xs px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingInvite || !inviteEmail.trim()}
                    className="omni-btn-primary text-xs px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold flex items-center gap-1.5"
                  >
                    {sendingInvite ? 'Creating...' : 'Create & Copy Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
