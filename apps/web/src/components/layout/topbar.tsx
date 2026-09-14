'use client';

import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, LogOut, Bell, CheckCheck, Clock, Menu } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { NotificationDto, PaginatedNotificationsDto, NotificationType } from '@omnigrc/shared';

interface TopbarProps {
  onToggleMobileSidebar?: () => void;
}

export function Topbar({ onToggleMobileSidebar }: TopbarProps) {
  const { user, organization, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const userName = user?.name || 'User';
  const orgName = organization?.name || 'Workspace';
  const roleName = user?.role || 'ANALYST';

  const initials = userName
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const fetchUnreadCount = async () => {
    try {
      const res = await apiRequest<{ unreadCount: number }>('/notifications/unread-count');
      setUnreadCount(res.unreadCount);
    } catch {
      // Fallback
    }
  };

  const fetchNotifications = async () => {
    setLoadingNotifs(true);
    try {
      const res = await apiRequest<PaginatedNotificationsDto>('/notifications?limit=10');
      setNotifications(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      // Fallback demo notifications if backend unreachable
      setNotifications([
        {
          id: '1',
          organizationId: '',
          userId: '',
          type: NotificationType.TASK_ASSIGNED,
          message: 'New compliance task assigned: "Conduct Annual ISO 27001 Internal Audit".',
          entityType: 'COMPLIANCE_TASK',
          entityId: 'task-1',
          read: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          organizationId: '',
          userId: '',
          type: NotificationType.POD_STATUS_CHANGED,
          message: 'Regional hosting pod "UK" status changed to INACTIVE.',
          entityType: 'REGIONAL_POD',
          entityId: 'pod-2',
          read: true,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ]);
    } finally {
      setLoadingNotifs(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleNotif = () => {
    if (!notifOpen) {
      fetchNotifications();
    }
    setNotifOpen((v) => !v);
    setMenuOpen(false);
  };

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/notifications/mark-all-read', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const getNotifBadgeStyle = (type: NotificationType) => {
    switch (type) {
      case NotificationType.MAPPING_OVERRIDDEN:
        return { bg: '#FCEFD9', color: '#8F5900', label: 'Override' };
      case NotificationType.POD_STATUS_CHANGED:
        return { bg: '#E4F1F0', color: '#0C5A56', label: 'Pod Change' };
      case NotificationType.TASK_ASSIGNED:
        return { bg: '#EBF3FF', color: '#1E64D4', label: 'Task' };
      case NotificationType.DUE_DATE_REMINDER:
        return { bg: '#F8E6E8', color: '#801F2B', label: 'Due Soon' };
      default:
        return { bg: '#EDEFED', color: '#5B6672', label: 'System' };
    }
  };

  return (
    <div 
      className="w-full max-w-full px-3 sm:px-6 relative z-40"
      style={{
        height: 56, minHeight: 56, borderBottom: '1px solid #E2E6E4',
        background: 'linear-gradient(90deg, #FFFFFF 0%, #FAFCFB 60%, rgba(15, 110, 106, 0.03) 85%, rgba(181, 117, 10, 0.02) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 500, color: '#1B2430', minWidth: 0 }}>
        {onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            className="lg:hidden omni-btn-ghost shrink-0"
            style={{ padding: 6 }}
            aria-label="Toggle Navigation Sidebar"
          >
            <Menu size={18} />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Building2 size={15} color="#5B6672" className="shrink-0" />
          <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-none font-bold text-slate-900">{orgName}</span>
          <span className="text-slate-400 font-normal hidden md:inline">· Pilot workspace</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="shrink-0">
        {/* Notification Bell Icon */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleToggleNotif}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={notifOpen}
            style={{
              background: notifOpen ? '#F4F6F5' : 'transparent', border: 'none', borderRadius: 8,
              padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: notifOpen ? '#0F6E6A' : '#5B6672', transition: 'background 0.15s ease',
            }}
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 3, right: 3, background: '#B23A48', color: '#FFF',
                fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                border: '2px solid #FFF',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>


          {/* Notifications Dropdown Popover */}
          {notifOpen && (
            <div className="omni-fade-in -right-10 sm:right-0 w-[300px] sm:w-[340px] max-w-[calc(100vw-24px)]" style={{
              position: 'absolute', top: 44, background: '#FFFFFF', border: '1px solid #E2E6E4',
              borderRadius: 10, boxShadow: '0 12px 30px rgba(15,23,42,0.15)', overflow: 'hidden', zIndex: 100,
            }}>
              <div style={{
                padding: '12px 14px', borderBottom: '1px solid #EDEFED', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', background: '#FAFBFB',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <span style={{ fontSize: 11, background: '#E4F1F0', color: '#0F6E6A', fontWeight: 700, padding: '1px 6px', borderRadius: 999 }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      background: 'none', border: 'none', color: '#0F6E6A', fontSize: 11.5,
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <CheckCheck size={13} /> Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: 340, overflowY: 'auto' }} className="omni-scroll">
                {loadingNotifs ? (
                  <div style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: '#8B95A1' }}>
                    Loading notifications...
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: '#8B95A1' }}>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((n) => {
                    const badge = getNotifBadgeStyle(n.type);
                    return (
                      <div
                        key={n.id}
                        onClick={(e) => !n.read && handleMarkRead(n.id, e)}
                        style={{
                          padding: '12px 14px', borderBottom: '1px solid #EDEFED',
                          background: n.read ? '#FFFFFF' : '#F9FCFC', cursor: 'pointer',
                          transition: 'background 0.15s ease', position: 'relative',
                        }}
                      >
                        {!n.read && (
                          <div style={{
                            position: 'absolute', left: 6, top: 18, width: 6, height: 6,
                            borderRadius: '50%', background: '#0F6E6A',
                          }} />
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                            background: badge.bg, color: badge.color,
                          }} className="omni-mono">
                            {badge.label}
                          </span>
                          <span style={{ fontSize: 10.5, color: '#8B95A1', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={10} />
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: n.read ? '#5B6672' : '#1B2430', fontWeight: n.read ? 400 : 500, lineHeight: 1.4 }}>
                          {n.message}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#E4F1F0', color: '#0F6E6A',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700,
            }} className="shrink-0">
              {initials}
            </div>
            <div className="hidden md:block" style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{userName}</div>
              <div style={{ fontSize: 11, color: '#8B95A1' }}>{roleName}</div>
            </div>
            <ChevronDown size={14} color="#8B95A1" className="shrink-0" />
          </div>

          {menuOpen && (
            <div
              className="omni-fade-in"
              style={{
                position: 'absolute', right: 0, top: 44, background: '#FFFFFF', border: '1px solid #E2E6E4',
                borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,0.15)', width: 172, overflow: 'hidden', zIndex: 100,
              }}
            >
              <div
                onClick={logout}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 13,
                  color: '#B23A48', cursor: 'pointer', fontWeight: 600,
                }}
                className="hover:bg-rose-50 transition-colors"
              >
                <LogOut size={14} color="#B23A48" /> Sign out
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
