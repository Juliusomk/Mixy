import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  FIREBASE_PROJECT_ID,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { apiFetch, isNativeCapacitor } from '../lib/api';
import { uploadMediaFile } from '../lib/media';
import { MixyLogo } from './MixyLogo';

type AuthMode = 'welcome' | 'login' | 'register' | 'forgot';

interface PendingProfileData {
  fullName: string;
  username: string;
  phone: string;
  dob: string;
  photoURL: string;
}

export function AuthScreen() {
  const {
    firebaseUser,
    needsEmailVerification,
    needsProfileSetup,
    refreshVerification,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('welcome');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Registration fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');

  const [pendingProfile, setPendingProfile] = useState<PendingProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [showProviderHelp, setShowProviderHelp] = useState(false);

  const createFirestoreProfile = async (
    uid: string,
    userEmail: string,
    profile: PendingProfileData
  ) => {
    const cleanUsername = profile.username.trim();
    const usernameLower = cleanUsername.toLowerCase();
    if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(cleanUsername)) {
      throw new Error('Username must be 3–30 characters using letters, numbers, underscores, or dots.');
    }

    const usernameRef = doc(db, 'usernames', usernameLower);
    const existingUsername = await getDoc(usernameRef);
    if (existingUsername.exists() && existingUsername.data().uid !== uid) {
      throw new Error('That username is already taken. Please choose another.');
    }

    const batch = writeBatch(db);
    batch.set(usernameRef, {
      uid,
      username: cleanUsername,
      createdAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', uid), {
      uid,
      username: cleanUsername,
      usernameLower,
      displayName: profile.fullName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
      bio: '',
      website: '',
      location: '',
      photoURL: profile.photoURL || '',
      coverURL: '',
      isVerified: false,
      verificationStatus: 'none',
      isPrivate: false,
      isDeactivated: false,
      role: 'user',
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      showOnlineStatus: true,
      showLastSeen: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', uid, 'private', 'info'), {
      uid,
      email: userEmail,
      phone: profile.phone.trim().slice(0, 30),
      dob: profile.dob.trim().slice(0, 20),
      blockedIds: [],
      restrictedIds: [],
      mutedIds: [],
      hiddenWords: [],
      storyVisibility: 'followers',
      mentionsPolicy: 'everyone',
      readReceipts: true,
      twoFactorEnabled: false,
      theme: 'light',
      accentColor: 'fuchsia',
      fontSize: 'md',
      language: 'en',
      notifyLikes: true,
      notifyComments: true,
      notifyFollowers: true,
      notifyMessages: true,
      notifyMentions: true,
      notifyStories: true,
      notifyCalls: true,
      notifyReposts: true,
      pushEnabled: false,
      contentPreferences: 'balanced',
      settingsAnimEnabled: true,
      settingsSoundEnabled: true,
      sleepModeEnabled: false,
      sleepScheduleEnabled: false,
      sleepStart: '22:30',
      sleepEnd: '07:00',
      sleepFocusLock: false,
      sleepPriorityIds: [],
      quietModeEnabled: false,
      screenTimeReminderMin: 0,
      visitorInsightsEnabled: false,
      callVoiceAllowed: 'everyone',
      callVideoAllowed: 'everyone',
      preferredCameraFacing: 'user',
      callIncomingBanner: true,
      closeFriendsIds: [],
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const rawMsg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked by your browser. Please allow popups for MIXY or sign in with Email & Password.');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Google sign-in was cancelled before completion. Try again whenever ready.');
      } else if (rawMsg.includes('disallowed_useragent') || code === 'auth/operation-not-supported-in-this-environment') {
        setError('Google Sign-In cannot run inside an embedded browser view. Open MIXY in Chrome/Safari or use Email & Password.');
      } else if (code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for Google Sign-In in Firebase Console yet.');
      } else {
        setError(rawMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      let loginEmail = identifier.trim();
      if (!loginEmail.includes('@')) {
        const res = await apiFetch('/api/auth/resolve-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: loginEmail }),
        });
        if (!res.ok) {
          throw new Error('No account found for that username. Try your registered email address.');
        }
        const data = (await res.json()) as { email: string };
        loginEmail = data.email;
      }
      await signInWithEmailAndPassword(auth, loginEmail, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      if (msg.includes('operation-not-allowed') || msg.includes('configuration-not-found')) {
        setShowProviderHelp(true);
        setError('Email/Password sign-in needs to be enabled in your Firebase Console Authentication Providers.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');

    if (!fullName.trim()) return setError('Please enter your full name.');
    if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(username.trim())) {
      return setError('Username must be 3–30 characters (letters, numbers, _, .).');
    }
    if (!email.trim().includes('@')) return setError('Please enter a valid email address.');
    if (!dob) return setError('Please enter your date of birth.');
    if (password.length < 8) return setError('Password must be at least 8 characters long.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      let uploadedPhotoUrl = '';
      if (avatarFile) {
        const uploaded = await uploadMediaFile(avatarFile);
        uploadedPhotoUrl = uploaded.url;
      }
      await updateProfile(cred.user, {
        displayName: fullName.trim(),
        photoURL: uploadedPhotoUrl || undefined,
      });

      const pending: PendingProfileData = {
        fullName: fullName.trim(),
        username: username.trim(),
        phone: phone.trim(),
        dob,
        photoURL: uploadedPhotoUrl,
      };
      setPendingProfile(pending);
      sessionStorage.setItem('mixy_pending_profile', JSON.stringify(pending));

      await sendEmailVerification(cred.user);
      setInfoMsg('Verification email sent! Please check your inbox and verify your email to finish creating your account.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      if (msg.includes('operation-not-allowed') || msg.includes('configuration-not-found')) {
        setShowProviderHelp(true);
        setError('Email/Password registration requires enabling the Email/Password sign-in method in Firebase Console.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    if (!email.trim().includes('@')) {
      return setError('Enter your registered email address.');
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfoMsg('Password reset link sent to your email address.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteVerification = async () => {
    setError('');
    setLoading(true);
    try {
      const verified = await refreshVerification();
      if (!verified) {
        setError('Email is not verified yet. Please click the verification link sent to your email.');
        return;
      }
      const user = auth.currentUser;
      if (!user) return;
      const storedRaw = sessionStorage.getItem('mixy_pending_profile');
      const profileData: PendingProfileData = pendingProfile || (storedRaw ? JSON.parse(storedRaw) : null);
      if (profileData) {
        await createFirestoreProfile(user.uid, user.email || '', profileData);
        sessionStorage.removeItem('mixy_pending_profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setError('');
    if (!fullName.trim()) return setError('Please enter your display name.');
    if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(username.trim())) {
      return setError('Username must be 3–30 characters (letters, numbers, _, .).');
    }
    if (!dob) return setError('Please enter your date of birth.');

    setLoading(true);
    try {
      let photoURL = firebaseUser.photoURL || '';
      if (avatarFile) {
        const uploaded = await uploadMediaFile(avatarFile);
        photoURL = uploaded.url;
      }
      await createFirestoreProfile(firebaseUser.uid, firebaseUser.email || '', {
        fullName: fullName.trim(),
        username: username.trim(),
        phone: phone.trim(),
        dob,
        photoURL,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Email Verification Gate
  if (needsEmailVerification && firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#07070D] mixy-aurora-surface">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#11111B]/90 backdrop-blur-xl p-8 space-y-6">
          <MixyLogo size="md" showTagline />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Verify your email</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              We sent a verification link to <span className="font-semibold text-fuchsia-400">{firebaseUser.email}</span>. Open your inbox, confirm your address, then continue.
            </p>
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {infoMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}
          <div className="space-y-3">
            <button
              onClick={handleCompleteVerification}
              disabled={loading}
              className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              I've Verified — Continue
            </button>
            <button
              onClick={async () => {
                setError('');
                try {
                  await sendEmailVerification(firebaseUser);
                  setInfoMsg('Verification email resent!');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to resend.');
                }
              }}
              className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/15 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Resend Verification Email
            </button>
            <button
              onClick={logout}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Sign out and use another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Profile Onboarding (e.g., first-time Google Sign-In)
  if (needsProfileSetup && firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#07070D] mixy-aurora-surface">
        <form
          onSubmit={handleCompleteOnboarding}
          className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#11111B]/90 backdrop-blur-xl p-8 space-y-5"
        >
          <div className="flex items-center justify-between">
            <MixyLogo size="sm" />
            <button
              type="button"
              onClick={logout}
              className="text-xs text-slate-500 hover:text-rose-400"
            >
              Sign out
            </button>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Finish setting up your profile</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choose your MIXY username and details for {firebaseUser.email}.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer group">
              <div className="w-16 h-16 rounded-full overflow-hidden mixy-gradient-bg flex items-center justify-center text-white font-bold text-xl">
                {avatarPreview || firebaseUser.photoURL ? (
                  <img
                    src={avatarPreview || firebaseUser.photoURL || ''}
                    alt="Profile preview"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  (fullName || firebaseUser.displayName || 'M')[0].toUpperCase()
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-slate-900 text-white border border-white/20 flex items-center justify-center">
                <Camera className="w-3.5 h-3.5" />
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Upload a profile picture (optional)
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={fullName || firebaseUser.displayName || ''}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Julius Omk"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Username *</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                placeholder="julius_omk"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Date of Birth *</label>
                <input
                  type="date"
                  required
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254 7..."
                  className="w-full h-11 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Enter MIXY
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 dark:bg-[#07070D] text-slate-900 dark:text-slate-100">
      {/* Left Branded Visual Showcase (Desktop & Mobile Hero) */}
      <div className="relative overflow-hidden flex flex-col justify-between p-8 lg:p-14 bg-[#090913] text-white min-h-[300px]">
        <div className="absolute inset-0 mixy-aurora-surface opacity-90 pointer-events-none" />
        {/* Stylized SVG Twilight Cityscape Backdrop */}
        <svg
          viewBox="0 0 800 400"
          preserveAspectRatio="xMidYMax slice"
          className="absolute inset-x-0 bottom-0 w-full h-64 opacity-45 pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="skyGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ec4899" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <rect x="0" y="120" width="800" height="280" fill="url(#skyGlow)" />
          <path
            d="M0 400 L0 260 L50 260 L50 210 L95 210 L95 280 L130 280 L130 175 L185 175 L185 265 L230 265 L230 140 L270 110 L310 140 L310 270 L360 270 L360 190 L420 190 L420 250 L470 250 L470 155 L525 155 L525 275 L580 275 L580 200 L640 200 L640 260 L700 260 L700 180 L760 180 L760 270 L800 270 L800 400 Z"
            fill="#07070D"
          />
        </svg>

        <div className="relative z-10 flex items-center justify-between">
          <MixyLogo size="lg" showTagline />
        </div>

        <div className="relative z-10 max-w-lg my-8 lg:my-0 space-y-4">
          <h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight leading-tight text-balance">
            Share your moments, reels, and real-time vibes.
          </h1>
          <p className="text-sm lg:text-base text-slate-300 leading-relaxed max-w-md">
            Join creators and friends on MIXY for 24-hour stories, vertical reels, live messaging, and curated collections.
          </p>
        </div>

        <div className="relative z-10 text-xs text-slate-400 flex items-center gap-4">
          <span>Feed</span>
          <span aria-hidden="true">·</span>
          <span>Stories</span>
          <span aria-hidden="true">·</span>
          <span>Reels</span>
          <span aria-hidden="true">·</span>
          <span>Direct Messages</span>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {infoMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {showProviderHelp && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
              <p className="font-semibold text-amber-500">Enable Email/Password in Firebase Console</p>
              <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                <li>Open Firebase Authentication Providers for project <span className="font-mono">{FIREBASE_PROJECT_ID}</span>.</li>
                <li>Click <strong>Add new provider</strong> and enable <strong>Email/Password</strong>.</li>
                <li>Return here and retry creating your account or logging in, or use <strong>Continue with Google</strong> right now.</li>
              </ol>
              <a
                href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-amber-500 font-semibold hover:underline pt-1"
              >
                Open Firebase Auth Providers <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {mode === 'welcome' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold">Welcome to MIXY</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Sign in with your account or create a new MIXY profile.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-fuchsia-500/20 hover:opacity-95 transition-opacity disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Continue with Google
                </button>

                {isNativeCapacitor() && (
                  <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                    Running inside the Android app shell: Email &amp; Password sign-in works immediately. Native Google Sign-In requires registering your app&apos;s SHA-1/SHA-256 fingerprint and <span className="font-mono">google-services.json</span>.
                  </p>
                )}

                <button
                  onClick={() => {
                    setError('');
                    setMode('login');
                  }}
                  className="w-full h-12 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-white/5 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Log in with Email or Username
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                <span>OR</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
              </div>

              <button
                onClick={() => {
                  setError('');
                  setMode('register');
                }}
                className="w-full h-11 rounded-xl text-fuchsia-600 dark:text-fuchsia-400 font-semibold text-sm hover:bg-fuchsia-500/10 transition-colors"
              >
                Create New Account
              </button>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Log in</h2>
                <button
                  type="button"
                  onClick={() => setMode('welcome')}
                  className="text-xs text-slate-500 hover:text-fuchsia-400"
                >
                  Back
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Email or Username</label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or julius_omk"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('forgot');
                    }}
                    className="text-xs text-fuchsia-500 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Log In
              </button>

              <p className="text-center text-xs text-slate-500">
                New to MIXY?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-fuchsia-500 font-semibold hover:underline"
                >
                  Create an account
                </button>
              </p>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Create account</h2>
                <button
                  type="button"
                  onClick={() => setMode('welcome')}
                  className="text-xs text-slate-500 hover:text-fuchsia-400"
                >
                  Back
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative cursor-pointer">
                  <div className="w-14 h-14 rounded-full overflow-hidden mixy-gradient-bg flex items-center justify-center text-white font-bold">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </label>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Add profile picture (optional)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                    placeholder="alex_rivera"
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Phone (Optional)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 0100"
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full h-10 pl-3 pr-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full h-10 pl-3 pr-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Account
              </button>

              <p className="text-center text-xs text-slate-500">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-fuchsia-500 font-semibold hover:underline"
                >
                  Log in
                </button>
              </p>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-fuchsia-500" />
                  Reset Password
                </h2>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs text-slate-500 hover:text-fuchsia-400"
                >
                  Back to Login
                </button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Enter your registered email address and we will send you a verified password reset link.
              </p>
              <div>
                <label className="block text-xs font-medium mb-1">Registered Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl mixy-gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Reset Link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
