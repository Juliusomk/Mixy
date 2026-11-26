import React from 'react';
import {
  BarChart3,
  Bookmark,
  Bot,
  HelpCircle,
  LayoutDashboard,
  Lock,
  LogOut,
  Moon,
  Settings,
  Star,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AppView } from '../types/mixy';
import type { SettingsSectionId } from './SettingsView';
import { MixyLogo, UserAvatar, VerifiedBadge } from './MixyLogo';

export function SideMenuDrawer({
  open,
  onClose,
  onNavigate,
  onOpenCloseFriends,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: AppView, settingsTab?: SettingsSectionId) => void;
  onOpenCloseFriends?: () => void;
}) {
  const { userPublic, isAdmin, isSleeping, logout } = useAuth();

  if (!open || !userPublic) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end">
      <div className="w-80 max-w-[85vw] h-full bg-white dark:bg-[#0D0D16] border-l border-slate-200 dark:border-white/10 p-6 flex flex-col justify-between overflow-y-auto shadow-2xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <MixyLogo size="sm" />
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => {
              onNavigate('profile');
              onClose();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-left"
          >
            <UserAvatar src={userPublic.photoURL} name={userPublic.displayName} size="md" hasStory />
            <div className="min-w-0">
              <p className="text-sm font-bold flex items-center gap-1 truncate text-slate-900 dark:text-white">
                <span className="truncate">{userPublic.displayName}</span>
                {userPublic.isVerified && (
                  <VerifiedBadge className="w-3.5 h-3.5" verificationType={userPublic.verificationType} />
                )}
              </p>
              <p className="text-xs text-slate-500 truncate">@{userPublic.username}</p>
            </div>
          </button>

          <nav className="space-y-1">
            {[
              { label: 'Julius AI', icon: <Bot className="w-5 h-5 text-fuchsia-500" />, action: () => onNavigate('julius') },
              { label: 'Creator Studio', icon: <BarChart3 className="w-5 h-5 text-violet-500" />, action: () => onNavigate('studio') },
              {
                label: 'Close Friends',
                icon: <Star className="w-5 h-5 text-emerald-500" />,
                action: () => onOpenCloseFriends?.(),
              },
              {
                label: isSleeping ? 'Sleep Mode (Resting)' : 'Digital Wellness & Sleep',
                icon: <Moon className="w-5 h-5 text-indigo-500" />,
                action: () => onNavigate('settings', 'wellness'),
              },
              { label: 'Profile', icon: <User className="w-5 h-5 text-fuchsia-500" />, action: () => onNavigate('profile') },
              { label: 'Saved & Activity', icon: <Bookmark className="w-5 h-5 text-pink-500" />, action: () => onNavigate('settings', 'content') },
              { label: 'Settings', icon: <Settings className="w-5 h-5 text-sky-500" />, action: () => onNavigate('settings', 'account') },
              { label: 'Privacy', icon: <Lock className="w-5 h-5 text-violet-500" />, action: () => onNavigate('settings', 'privacy') },
              { label: 'Help & Support', icon: <HelpCircle className="w-5 h-5 text-amber-500" />, action: () => onNavigate('settings', 'support') },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.action();
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}

            {isAdmin && (
              <button
                onClick={() => {
                  onNavigate('admin');
                  onClose();
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-amber-500 hover:bg-amber-500/10 transition-colors text-left"
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Admin & Moderation</span>
              </button>
            )}
          </nav>
        </div>

        <button
          onClick={() => {
            onClose();
            void logout();
          }}
          className="mt-4 w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
}
