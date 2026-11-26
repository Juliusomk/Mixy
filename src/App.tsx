import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  Bot,
  Compass,
  Film,
  Home,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { CallOverlay } from './components/CallOverlay';
import { CloseFriendsModal } from './components/CloseFriendsModal';
import { CreateModal } from './components/CreateModal';
import { FloatingMessagesOverlay } from './components/dm/FloatingMessagesOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeedView } from './components/FeedView';
import { MixyLogo, UserAvatar, VerifiedBadge } from './components/MixyLogo';
import { OnboardingModal, hasCompletedOnboarding } from './components/OnboardingModal';
import { RightDiscoveryRail } from './components/RightDiscoveryRail';
import type { SettingsSectionId } from './components/SettingsView';
import { SideMenuDrawer } from './components/SideMenuDrawer';
import { SleepingMoonBanner } from './components/SleepingMoonBanner';
import { SplashScreen } from './components/SplashScreen';
import { StoriesBar } from './components/StoriesBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { db } from './lib/firebase';
import { isReducedMotionActive, triggerHaptic } from './lib/haptics';
import type { AppView, Conversation, GroupInvite } from './types/mixy';

const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);
const CreatorStudioView = lazy(() =>
  import('./components/CreatorStudioView').then((m) => ({ default: m.CreatorStudioView }))
);
const ExploreView = lazy(() =>
  import('./components/ExploreView').then((m) => ({ default: m.ExploreView }))
);
const JuliusChatPanel = lazy(() =>
  import('./components/JuliusChatPanel').then((m) => ({ default: m.JuliusChatPanel }))
);
const MessagesView = lazy(() =>
  import('./components/MessagesView').then((m) => ({ default: m.MessagesView }))
);
const NotificationsView = lazy(() =>
  import('./components/NotificationsView').then((m) => ({ default: m.NotificationsView }))
);
const ProfileView = lazy(() =>
  import('./components/ProfileView').then((m) => ({ default: m.ProfileView }))
);
const ReelsView = lazy(() =>
  import('./components/ReelsView').then((m) => ({ default: m.ReelsView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);

function MixyShell() {
  const {
    firebaseUser,
    authReady,
    userPublic,
    needsEmailVerification,
    needsProfileSetup,
    isAdmin,
    unreadNotifications,
  } = useAuth();

  const [view, setView] = useState<AppView>('home');
  const [profileTargetUid, setProfileTargetUid] = useState<string | null>(null);
  const [exploreQuery, setExploreQuery] = useState('');
  const [exploreHashtag, setExploreHashtag] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsSectionId>('account');
  const [createTab, setCreateTab] = useState<'post' | 'reel' | 'story' | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false);

  // Floating water-bubble DM animation state
  const [bubbleBurstCount, setBubbleBurstCount] = useState(0);
  const [bubbleHintActive, setBubbleHintActive] = useState(false);

  // Animated Splash & First-Time Onboarding state
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Deep-link Group Invite preview modal
  const [pendingInvite, setPendingInvite] = useState<GroupInvite | null>(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    if (!authReady) return;
    if (isReducedMotionActive()) {
      setSplashDismissed(true);
      return;
    }
    const timer = window.setTimeout(() => setSplashDismissed(true), 480);
    return () => window.clearTimeout(timer);
  }, [authReady]);

  useEffect(() => {
    if (authReady && firebaseUser && userPublic && !hasCompletedOnboarding(userPublic.uid)) {
      setOnboardingOpen(true);
    }
  }, [authReady, firebaseUser, userPublic]);

  useEffect(() => {
    const onReplay = () => setOnboardingOpen(true);
    window.addEventListener('mixy:open-onboarding', onReplay);
    return () => window.removeEventListener('mixy:open-onboarding', onReplay);
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser || !userPublic) return;
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    const reelParam = params.get('reel');
    const storyParam = params.get('story');

    if (reelParam) {
      setView('reels');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (storyParam) {
      setView('stories');
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (joinCode && /^[a-zA-Z0-9_-]{1,64}$/.test(joinCode)) {
      window.history.replaceState({}, '', window.location.pathname);
      void (async () => {
        try {
          const snap = await getDoc(doc(db, 'groupInvites', joinCode));
          if (snap.exists()) {
            const inv = snap.data() as GroupInvite;
            if (inv.isActive) {
              setPendingInvite(inv);
            }
          }
        } catch {
          // ignore expired/revoked invite
        }
      })();
    }
  }, [authReady, firebaseUser, userPublic]);

  if (!authReady || !splashDismissed) {
    return (
      <SplashScreen
        ready={authReady && splashDismissed}
        onSkip={authReady ? () => setSplashDismissed(true) : undefined}
      />
    );
  }

  if (!firebaseUser || needsEmailVerification || needsProfileSetup || !userPublic) {
    return <AuthScreen />;
  }

  const navigateTo = (nextView: AppView) => {
    triggerHaptic('light');
    setBubbleHintActive(false);
    setView(nextView);
  };

  const openProfile = (uid?: string) => {
    triggerHaptic('light');
    setProfileTargetUid(uid || userPublic.uid);
    setView('profile');
  };

  const openHashtag = (tag: string) => {
    triggerHaptic('light');
    setExploreHashtag(tag);
    setExploreQuery('');
    setView('explore');
  };

  const openExploreSearch = (q = '') => {
    triggerHaptic('light');
    setExploreHashtag('');
    setExploreQuery(q);
    setView('explore');
  };

  const openMessageConversation = (convId: string) => {
    triggerHaptic('light');
    setBubbleHintActive(false);
    setActiveConversationId(convId);
    setView('messages');
  };

  // Two-step MIXY Messages Icon handler:
  // 1st press triggers floating water bubbles; swipe-down restores bubbles; 2nd press opens DM inbox smoothly!
  const handleMessagesIconClick = () => {
    triggerHaptic('light');
    if (view === 'messages') {
      setBubbleBurstCount((c) => c + 1);
      return;
    }
    if (bubbleHintActive) {
      setBubbleHintActive(false);
      setView('messages');
    } else {
      setBubbleBurstCount((c) => c + 1);
      setBubbleHintActive(true);
    }
  };

  const handleConfirmJoinInvite = async () => {
    if (!pendingInvite || !userPublic || joiningInvite) return;
    setJoiningInvite(true);
    setInviteError('');
    try {
      const convSnap = await getDoc(doc(db, 'conversations', pendingInvite.conversationId));
      if (convSnap.exists() && (convSnap.data() as Conversation).participantIds.includes(userPublic.uid)) {
        setActiveConversationId(pendingInvite.conversationId);
        setView('messages');
        setPendingInvite(null);
        return;
      }
      const batch = writeBatch(db);
      batch.update(doc(db, 'conversations', pendingInvite.conversationId), {
        participantIds: arrayUnion(userPublic.uid),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'conversations', pendingInvite.conversationId, 'members', userPublic.uid), {
        userId: userPublic.uid,
        role: 'member',
        isPinned: false,
        isMuted: false,
        isArchived: false,
        isRequest: false,
        joinedAt: serverTimestamp(),
      });
      await batch.commit();
      setActiveConversationId(pendingInvite.conversationId);
      setView('messages');
      setPendingInvite(null);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Unable to join group.');
    } finally {
      setJoiningInvite(false);
    }
  };

  const desktopNavItems: {
    id: AppView;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
    { id: 'explore', label: 'Explore', icon: <Compass className="w-5 h-5" /> },
    { id: 'reels', label: 'Reels', icon: <Film className="w-5 h-5" /> },
    { id: 'stories', label: 'Stories', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'messages', label: 'Messages', icon: <MessageCircle className="w-5 h-5" /> },
    { id: 'julius', label: 'Julius AI', icon: <Bot className="w-5 h-5" /> },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-5 h-5" />,
      badge: unreadNotifications,
    },
    { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
    { id: 'studio', label: 'Studio', icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#07070D] text-slate-900 dark:text-slate-100 pb-20 lg:pb-6 transition-colors duration-200">
      {/* Mobile / Tablet Top Header (56px compact) */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-white/95 dark:bg-[#07070D]/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between">
        <button onClick={() => setView('home')} aria-label="MIXY Home">
          <MixyLogo size="sm" />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setView('julius')}
            className={`w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center ${
              view === 'julius' ? 'text-fuchsia-500 bg-fuchsia-500/10' : ''
            }`}
            aria-label="Chat with Julius AI"
            title="Chat with Julius AI"
          >
            <Bot className="w-5 h-5 text-fuchsia-400" />
          </button>

          <button
            onClick={() => setView('stories')}
            className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Stories"
          >
            <Sparkles className="w-5 h-5 text-amber-400" />
          </button>

          <button
            onClick={() => setView('notifications')}
            className="relative w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full mixy-gradient-bg text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          <button
            onClick={handleMessagesIconClick}
            className={`relative w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center ${
              view === 'messages' || bubbleHintActive ? 'text-fuchsia-500 bg-fuchsia-500/10' : ''
            }`}
            aria-label="Direct Messages"
          >
            <MessageCircle className="w-5 h-5" />
          </button>

          <button
            onClick={() => setDrawerOpen(true)}
            className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Responsive Desktop + Mobile Grid */}
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 lg:pt-6 flex gap-6 lg:gap-8">
        {/* Left Navigation Rail (Desktop >= lg) */}
        <aside className="hidden lg:flex flex-col justify-between w-60 shrink-0 sticky top-6 h-[calc(100vh-48px)] rounded-3xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#10101A] p-4 mixy-card-shadow">
          <div className="space-y-5">
            <button onClick={() => setView('home')} className="px-2 block">
              <MixyLogo size="md" showTagline />
            </button>

            <nav className="space-y-1">
              {desktopNavItems.map((item) => {
                const isActive =
                  view === item.id &&
                  (item.id !== 'profile' || !profileTargetUid || profileTargetUid === userPublic.uid);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'messages') {
                        handleMessagesIconClick();
                        return;
                      }
                      setBubbleHintActive(false);
                      if (item.id === 'profile') setProfileTargetUid(userPublic.uid);
                      setView(item.id);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      isActive
                        ? 'mixy-gradient-bg text-white shadow-md shadow-fuchsia-500/20'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      {item.label}
                    </span>
                    {item.badge && item.badge > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold tabular-nums">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {isAdmin && (
                <button
                  onClick={() => setView('admin')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    view === 'admin'
                      ? 'mixy-gradient-bg text-white'
                      : 'text-amber-500 hover:bg-amber-500/10'
                  }`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Admin
                </button>
              )}
            </nav>

            <button
              onClick={() => setCreateTab('post')}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-500/20 hover:opacity-95 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Create
            </button>
          </div>

          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 text-left"
          >
            <UserAvatar src={userPublic.photoURL} name={userPublic.displayName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate flex items-center gap-1">
                <span className="truncate">{userPublic.displayName}</span>
                {userPublic.isVerified && (
                  <VerifiedBadge className="w-3 h-3" verificationType={userPublic.verificationType} />
                )}
              </p>
              <p className="text-[11px] text-slate-500 truncate">@{userPublic.username}</p>
            </div>
            <Menu className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </aside>

        {/* Center Main Workspace */}
        <main
          className={`flex-1 min-w-0 mx-auto ${
            view === 'messages' ||
            view === 'julius' ||
            view === 'explore' ||
            view === 'studio' ||
            view === 'settings' ||
            view === 'admin'
              ? 'max-w-4xl'
              : 'max-w-[660px]'
          }`}
        >
          <SleepingMoonBanner />

          <Suspense
            fallback={
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" />
                <span className="text-xs font-medium">Loading view...</span>
              </div>
            }
          >
            <div key={view} className="mixy-view-enter">
              {view === 'home' && (
                <FeedView
                  onOpenCreatePost={() => setCreateTab('post')}
                  onOpenCreateStory={() => setCreateTab('story')}
                  onOpenExploreSearch={openExploreSearch}
                  onOpenProfile={openProfile}
                  onOpenHashtag={openHashtag}
                />
              )}

              {view === 'explore' && (
                <ExploreView
                  initialQuery={exploreQuery}
                  initialHashtag={exploreHashtag}
                  onOpenProfile={openProfile}
                  onOpenReels={() => navigateTo('reels')}
                />
              )}

              {view === 'reels' && (
                <ReelsView
                  onOpenCreateReel={() => setCreateTab('reel')}
                  onOpenProfile={openProfile}
                  onOpenHashtag={openHashtag}
                />
              )}

              {view === 'stories' && (
                <StoriesBar
                  fullPage
                  onOpenCreateStory={() => setCreateTab('story')}
                  onOpenProfile={openProfile}
                />
              )}

              {view === 'messages' && (
                <MessagesView
                  initialConversationId={activeConversationId}
                  onOpenProfile={openProfile}
                  onOpenPost={() => navigateTo('home')}
                  onOpenReel={() => navigateTo('reels')}
                  onOpenStories={() => navigateTo('stories')}
                />
              )}

              {view === 'julius' && <JuliusChatPanel standalone onOpenProfile={openProfile} />}

              {view === 'notifications' && (
                <NotificationsView
                  onOpenProfile={openProfile}
                  onOpenMessages={() => navigateTo('messages')}
                  onOpenSettings={() => {
                    setSettingsTab('notifications');
                    navigateTo('settings');
                  }}
                />
              )}

              {view === 'profile' && (
                <ProfileView
                  targetUid={profileTargetUid}
                  onOpenProfile={openProfile}
                  onOpenMessageConv={openMessageConversation}
                  onOpenSettings={() => {
                    setSettingsTab('account');
                    navigateTo('settings');
                  }}
                  onOpenStudio={() => navigateTo('studio')}
                  onOpenCloseFriends={() => setCloseFriendsOpen(true)}
                  onOpenHashtag={openHashtag}
                />
              )}

              {view === 'studio' && (
                <CreatorStudioView
                  onOpenCreate={(tab) => setCreateTab(tab)}
                  onOpenProfile={openProfile}
                />
              )}

              {view === 'settings' && (
                <SettingsView
                  initialSection={settingsTab}
                  onOpenCloseFriends={() => setCloseFriendsOpen(true)}
                />
              )}

              {view === 'admin' && <AdminDashboardView onOpenProfile={openProfile} />}
            </div>
          </Suspense>
        </main>

        {/* Right Discovery Panel on Home / Profile / Notifications */}
        {(view === 'home' || view === 'profile' || view === 'notifications') && (
          <RightDiscoveryRail
            onOpenProfile={openProfile}
            onOpenMessages={() => setView('messages')}
            onOpenJulius={() => setView('julius')}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation Bar: 1. Home 2. Explore 3. Create 4. Reels 5. Profile */}
      <nav
        aria-label="Primary navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white/90 dark:bg-[#0B0B14]/90 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 grid grid-cols-5 items-center px-2"
      >
        <button
          onClick={() => setView('home')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
            view === 'home' ? 'text-fuchsia-500' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Home</span>
        </button>

        <button
          onClick={() => setView('explore')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
            view === 'explore' ? 'text-fuchsia-500' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Explore</span>
        </button>

        <div className="flex items-center justify-center">
          <button
            onClick={() => setCreateTab('post')}
            aria-label="Create post, reel, or story"
            className="w-12 h-11 rounded-2xl mixy-gradient-bg text-white flex items-center justify-center shadow-lg shadow-fuchsia-500/30 active:scale-95 transition-transform"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <button
          onClick={() => setView('reels')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
            view === 'reels' ? 'text-fuchsia-500' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Film className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Reels</span>
        </button>

        <button
          onClick={() => openProfile(userPublic.uid)}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
            view === 'profile' ? 'text-fuchsia-500' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Profile</span>
        </button>
      </nav>

      {/* MIXY Floating Water Bubble Overlay */}
      <FloatingMessagesOverlay
        burstTrigger={bubbleBurstCount}
        activeHint={bubbleHintActive}
        onSwipeRestore={() => setBubbleBurstCount((c) => c + 1)}
        onOpenInbox={() => {
          setBubbleHintActive(false);
          setView('messages');
        }}
        onDismissHint={() => setBubbleHintActive(false)}
      />

      {/* Deep-Link Group Invite Preview Modal */}
      {pendingInvite && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#12121D] border border-slate-200 dark:border-white/10 p-6 space-y-4 text-center">
            <div className="flex justify-end -mt-2 -mr-2">
              <button
                type="button"
                onClick={() => setPendingInvite(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="w-14 h-14 mx-auto rounded-2xl mixy-gradient-bg text-white flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{pendingInvite.groupName}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {pendingInvite.memberCount} members · Invited to join MIXY Group Chat
              </p>
            </div>
            {inviteError && <p className="text-xs text-rose-500">{inviteError}</p>}
            <button
              type="button"
              onClick={() => void handleConfirmJoinInvite()}
              disabled={joiningInvite}
              className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              {joiningInvite && <Loader2 className="w-4 h-4 animate-spin" />}
              Join Group & Open Chat
            </button>
          </div>
        </div>
      )}

      {/* Create Modal (Post / Reel / Story) */}
      {createTab && (
        <CreateModal
          initialTab={createTab}
          onClose={() => setCreateTab(null)}
          onCreated={(tab) => {
            if (tab === 'reel') setView('reels');
            else if (tab === 'story') setView('home');
            else setView('home');
          }}
        />
      )}

      {/* Side Menu Drawer */}
      <SideMenuDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenCloseFriends={() => setCloseFriendsOpen(true)}
        onNavigate={(nextView, sTab) => {
          if (nextView === 'profile') setProfileTargetUid(userPublic.uid);
          if (sTab) setSettingsTab(sTab);
          setView(nextView);
        }}
      />

      {/* Close Friends Manager Modal */}
      <CloseFriendsModal
        open={closeFriendsOpen}
        onClose={() => setCloseFriendsOpen(false)}
      />

      {/* Global Incoming / Active Voice & Video Call Overlay */}
      <CallOverlay />

      {/* Dismissible First-Time Onboarding Tour */}
      <OnboardingModal
        open={onboardingOpen}
        uid={userPublic.uid}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CallProvider>
          <MixyShell />
        </CallProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
