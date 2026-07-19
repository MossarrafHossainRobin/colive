'use client'

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, EyeOff, Mail, Lock, ArrowRight, 
  Loader2, LogIn, UserPlus, User, AlertCircle, 
  CheckCircle, Shield, KeyRound, ArrowLeft
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider, 
  signInWithCredential,
  signInWithPopup
} from 'firebase/auth';
import Link from 'next/link';

// ==================== GOOGLE BUTTON ====================
function GoogleButton({ onClick, loading }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-xl border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow transition-all duration-200 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      ) : (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      )}
      <span className="text-sm font-medium">{loading ? 'Signing in...' : 'Continue with Google'}</span>
    </motion.button>
  );
}

// ==================== INPUT FIELD ====================
function InputField({ icon: Icon, label, type, value, onChange, placeholder, showToggle, showPassword, onToggle, required, disabled, autoComplete }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 ml-1 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative group">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-violet-500 transition-colors duration-200" />
        <input
          type={showToggle ? (showPassword ? 'text' : 'password') : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none text-gray-800 placeholder-gray-400 text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          required={required}
        />
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ==================== VERIFICATION CODE INPUT ====================
function CodeInput({ code, setCode, loading }) {
  const inputRefs = useRef([]);

  const handleChange = (index, value) => {
    if (value.length > 1) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...code];
    pasted.split('').forEach((char, i) => { if (i < 6) newCode[i] = char; });
    setCode(newCode);
    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {code.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          disabled={loading}
          className="w-11 h-14 text-center text-xl font-bold bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none text-gray-800 transition-all duration-200 disabled:opacity-50"
        />
      ))}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [verificationSent, setVerificationSent] = useState(false);

  // ==================== RIGHT-CLICK PROTECTION ====================
  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // ==================== KEYBOARD SHORTCUT PROTECTION ====================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 's' || e.key === 'i' || e.key === 'j' || e.key === 'c')) {
        e.preventDefault();
      }
      if (e.key === 'F12') e.preventDefault();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ==================== DETECT MOBILE ====================
  useEffect(() => {
    const check = () => setIsMobile(/Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ==================== ANIMATION ====================
  useEffect(() => {
    const timer = setTimeout(() => setAnimationComplete(true), 600);
    return () => clearTimeout(timer);
  }, []);

  // Reset on mode change
  useEffect(() => {
    setError('');
    setSuccess('');
    setVerificationSent(false);
    setVerificationCode(['', '', '', '', '', '']);
  }, [mode]);

  // ==================== GOOGLE LOGIN ====================
  const handleGoogleLogin = useCallback(async () => {
    setError('');
    setGoogleLoading(true);

    if (isMobile) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        if (result.user) router.push('/dashboard');
      } catch (err) {
        if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
          setError('Authentication failed. Please try again.');
        }
      } finally { setGoogleLoading(false); }
      return;
    }

    try {
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 25000);
        window.google?.accounts?.id?.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: (r) => { clearTimeout(timeout); resolve(r); },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google?.accounts?.id?.prompt((n) => {
          if (n.isNotDisplayed()) { clearTimeout(timeout); reject(new Error(n.getNotDisplayedReason())); }
        });
      });
      const credential = GoogleAuthProvider.credential(response.credential);
      await signInWithCredential(auth, credential);
      router.push('/dashboard');
    } catch (err) {
      console.log('One Tap failed:', err.message);
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        if (result.user) router.push('/dashboard');
      } catch (popupErr) {
        if (popupErr.code !== 'auth/cancelled-popup-request' && popupErr.code !== 'auth/popup-closed-by-user') {
          setError('Unable to authenticate. Please use email login.');
        }
      }
    } finally { setGoogleLoading(false); }
  }, [router, isMobile]);

  // ==================== LOAD GSI ====================
  useEffect(() => {
    if (isMobile) return;
    if (document.getElementById('gsi-client')) return;
    const script = document.createElement('script');
    script.id = 'gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    document.head.appendChild(script);
  }, [isMobile]);

  // ==================== FORM SUBMIT ====================
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        router.push('/dashboard');
      } else if (mode === 'register') {
        if (password !== confirmPassword) { setError('Passwords do not match.'); setLoading(false); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); setLoading(false); return; }
        if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter.'); setLoading(false); return; }
        if (!/[0-9]/.test(password)) { setError('Password must contain at least one number.'); setLoading(false); return; }
        if (!acceptedTerms) { setError('Please accept the Terms of Service.'); setLoading(false); return; }
        await createUserWithEmailAndPassword(auth, email, password);
        router.push('/dashboard');
      } else if (mode === 'forgot') {
        if (!verificationSent) {
          await sendPasswordResetEmail(auth, email);
          setVerificationSent(true);
          setSuccess('Verification code sent to your email.');
        } else {
          const code = verificationCode.join('');
          if (code.length < 6) { setError('Please enter the complete verification code.'); setLoading(false); return; }
          setSuccess('Code verified. Check your email for the reset link.');
          setVerificationSent(false);
          setMode('login');
        }
      }
    } catch (err) {
      const messages = {
        'auth/user-not-found': 'No account found with this email address.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password is too weak.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
      };
      setError(messages[err.code] || 'An error occurred. Please try again.');
    } finally { setLoading(false); }
  }, [mode, email, password, confirmPassword, acceptedTerms, verificationCode, verificationSent, router]);

  // ==================== TITLES ====================
  const titles = {
    login: { title: 'Sign in', subtitle: 'Access your account securely' },
    register: { title: 'Create account', subtitle: 'Join the platform today' },
    forgot: { title: 'Reset password', subtitle: 'Receive a verification code via email' },
  };
  const { title, subtitle } = titles[mode];

  // ==================== RENDER ====================
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-violet-50 p-4 sm:p-6 relative">
      
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-200/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-200/20 rounded-full blur-[120px]" />
      </div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: animationComplete ? 1 : 0, y: animationComplete ? 0 : 20 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[440px] relative z-10"
      >
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl shadow-gray-200/60 border border-gray-100 p-6 sm:p-8">
          
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-200">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-800 tracking-tight">NestHub</span>
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-1">{title}</h1>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success */}
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5"
              >
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-emerald-600">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Button */}
          {mode !== 'forgot' && (
            <>
              <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} />
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 bg-white text-[10px] text-gray-400 uppercase tracking-wider font-semibold select-none">or</span>
                </div>
              </div>
            </>
          )}

          {/* Form */}
          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              onSubmit={handleSubmit}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-3.5"
            >
              {/* Name */}
              {mode === 'register' && (
                <InputField icon={User} label="Full Name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required autoComplete="name" />
              )}

              {/* Email */}
              {!(mode === 'forgot' && verificationSent) && (
                <InputField icon={Mail} label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
              )}

              {/* Password */}
              {mode !== 'forgot' && (
                <InputField
                  icon={Lock}
                  label="Password"
                  type="password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  showToggle showPassword={showPassword} onToggle={() => setShowPassword(!showPassword)}
                  required autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              )}

              {/* Confirm Password */}
              {mode === 'register' && (
                <InputField icon={Lock} label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" required autoComplete="new-password" />
              )}

              {/* Verification Code */}
              {mode === 'forgot' && verificationSent && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-3 ml-1 uppercase tracking-wider text-center">
                    Verification Code
                  </label>
                  <CodeInput code={verificationCode} setCode={setVerificationCode} loading={loading} />
                  <p className="text-xs text-gray-400 text-center mt-3">
                    Enter the 6-digit code sent to your email
                  </p>
                </div>
              )}

              {/* Remember + Forgot */}
              {mode === 'login' && (
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                    <span className="text-xs text-gray-500">Remember me</span>
                  </label>
                  <button type="button" onClick={() => setMode('forgot')} className="text-xs text-violet-600 hover:text-violet-700 font-medium transition-colors">Forgot password?</button>
                </div>
              )}

              {/* Terms */}
              {mode === 'register' && (
                <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
                  <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5" />
                  <span className="text-xs text-gray-500">I agree to the <span className="text-violet-600 font-medium cursor-pointer hover:underline">Terms of Service</span> and <span className="text-violet-600 font-medium cursor-pointer hover:underline">Privacy Policy</span></span>
                </label>
              )}

              {/* Submit */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors duration-200 disabled:opacity-50 shadow-lg shadow-violet-200 text-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>{mode === 'login' && <><LogIn className="w-4 h-4" /> Sign in</>}
                   {mode === 'register' && <><UserPlus className="w-4 h-4" /> Create account</>}
                   {mode === 'forgot' && !verificationSent && <><Mail className="w-4 h-4" /> Send code</>}
                   {mode === 'forgot' && verificationSent && <><KeyRound className="w-4 h-4" /> Verify code</>}</>
                )}
              </motion.button>
            </motion.form>
          </AnimatePresence>

          {/* Mode Switcher */}
          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            {mode === 'login' && (
              <p className="text-xs text-gray-500">No account? <button onClick={() => setMode('register')} className="text-violet-600 hover:text-violet-700 font-semibold transition-colors">Create one</button></p>
            )}
            {mode === 'register' && (
              <p className="text-xs text-gray-500">Already have an account? <button onClick={() => setMode('login')} className="text-violet-600 hover:text-violet-700 font-semibold transition-colors">Sign in</button></p>
            )}
            {mode === 'forgot' && (
              <button onClick={() => { setMode('login'); setVerificationSent(false); }} className="text-xs text-gray-500 hover:text-gray-700 transition-colors font-medium flex items-center gap-1 mx-auto">
                <ArrowLeft className="w-3 h-3" /> Back to sign in
              </button>
            )}
          </div>

          <div className="mt-3 text-center">
            <Link href="/" className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors font-medium">Back to home</Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}