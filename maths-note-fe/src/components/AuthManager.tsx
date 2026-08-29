import React, { useState } from 'react';
import { Modal, TextInput, PasswordInput, Button, Text, Group, Stack, Alert, LoadingOverlay, Menu } from '@mantine/core';
import { supabase } from '@/lib/supabase';
import { notifications } from '@mantine/notifications';
import { LogOut, Trash2, Cloud, Mail, Lock, User as UserIcon, X } from 'lucide-react';

import type { User } from '@supabase/supabase-js';

interface AuthManagerProps {
    user: User | null;
    clearHistory: () => Promise<void>;
    isFocusMode?: boolean;
}

export function AuthManager({ user, clearHistory, isFocusMode = false }: AuthManagerProps) {
    const [opened, setOpened] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [regDisplayName, setRegDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [confirmPurge, setConfirmPurge] = useState(false);

    // If Supabase is not configured, don't show the auth controls
    if (!supabase) {
        return null;
    }

    const mapAuthError = (message: string): string => {
        const msg = message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("email_exists") || msg.includes("user already exists") || msg.includes("already exists")) {
            return "That email's already registered — try signing in instead.";
        }
        if (msg.includes("invalid login credentials") || msg.includes("invalid credentials") || msg.includes("email not confirmed")) {
            return "Incorrect email or password.";
        }
        if (msg.includes("password should be") || msg.includes("password is too weak") || msg.includes("weak_password") || msg.includes("signup_password_too_short")) {
            return "Password is too weak. Please use at least 6 characters with letters and numbers.";
        }
        if (msg.includes("rate limit") || msg.includes("too many requests")) {
            return "Too many requests. Please try again in a few minutes.";
        }
        return "Something went wrong — please try again.";
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Client-side validations
        if (isSignUp && !regDisplayName.trim()) {
            setErrorMsg("Display name is required.");
            return;
        }
        if (password.length < 6) {
            setErrorMsg("Password must be at least 6 characters.");
            return;
        }

        setLoading(true);
        setErrorMsg(null);

        try {
            if (isSignUp) {
                const { data, error } = await supabase!.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: regDisplayName,
                            display_name: regDisplayName
                        }
                    }
                });
                if (error) throw error;
                
                if (data.session) {
                    notifications.show({
                        title: 'Account Created!',
                        message: `Welcome, ${regDisplayName} — your history is now syncing!`,
                        color: 'green',
                    });
                    setOpened(false);
                } else {
                    notifications.show({
                        title: 'Verification Email Sent',
                        message: `Check your inbox at ${email} to verify your account and activate sync.`,
                        color: 'blue',
                        autoClose: 10000,
                    });
                    setOpened(false);
                }
            } else {
                const { error } = await supabase!.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                
                notifications.show({
                    title: 'Signed In Successfully',
                    message: 'Welcome back! Your history is now synced.',
                    color: 'green',
                });
                setOpened(false);
            }
            // Clear input fields
            setEmail('');
            setPassword('');
            setRegDisplayName('');
        } catch (err: any) {
            setErrorMsg(mapAuthError(err.message || ''));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const { error } = await supabase!.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (err: any) {
            setErrorMsg(mapAuthError(err.message || ''));
            setLoading(false);
        }
    };

    const handleResetPasswordRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);
        try {
            const { error } = await supabase!.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`
            });
            if (error) throw error;
        } catch {
            // Securely mask any errors (e.g. user not found) with identical success confirmation
        } finally {
            notifications.show({
                title: 'Reset Link Sent',
                message: 'If an account exists for that email, a password reset link has been sent to it.',
                color: 'teal',
                autoClose: 8000,
            });
            setIsForgotPassword(false);
            setEmail('');
            setLoading(false);
            setOpened(false);
        }
    };

    const handleSignOut = async () => {
        setLoading(true);
        try {
            await supabase!.auth.signOut();
            notifications.show({
                title: 'Signed Out',
                message: 'You have been signed out. Switched back to guest mode.',
                color: 'blue',
            });
            setOpened(false);
        } catch (err: any) {
            notifications.show({
                title: 'Error Signing Out',
                message: err.message,
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePurgeData = async () => {
        setLoading(true);
        try {
            // 1. Wipe backend + local history
            await clearHistory();
            
            // 2. Sign out
            await supabase!.auth.signOut();

            notifications.show({
                title: 'Data Purged Successfully',
                message: 'All your account history data has been permanently deleted.',
                color: 'teal',
            });
            setConfirmPurge(false);
            setOpened(false);
        } catch (err: any) {
            notifications.show({
                title: 'Error purging data',
                message: err.message,
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    const getInitials = () => {
        if (!user) return '?';
        const name = user.user_metadata?.display_name || user.user_metadata?.full_name;
        if (name) {
            const parts = name.trim().split(/\s+/);
            if (parts.length > 0) {
                return parts.map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
            }
        }
        if (user.email) {
            return user.email[0].toUpperCase();
        }
        return '?';
    };

    const displayName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || '';

    return (
        <div className={`transition-opacity duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            {user ? (
                /* Signed In: Avatar (Google image or initials) with Dropdown Menu */
                <Menu shadow="md" width={220} position="bottom-end" transitionProps={{ transition: 'fade', duration: 150 }}>
                    <Menu.Target>
                        <button
                            className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-9 w-9 rounded-full flex items-center justify-center cursor-pointer shadow-md select-none hover:scale-105 active:scale-95 transition-all font-sans text-sm border-none outline-none relative"
                            title={`Signed in as ${user.email}`}
                            aria-label={`Signed in as ${user.email}`}
                        >
                            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-amber-500">
                                {user.user_metadata?.avatar_url ? (
                                    <img 
                                        src={user.user_metadata.avatar_url} 
                                        alt="Profile" 
                                        className="w-full h-full object-cover" 
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    getInitials()
                                )}
                            </div>
                            <span className="absolute bottom-0 right-0 flex h-2.5 w-2.5 translate-x-0.5 translate-y-0.5">
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-400 border-2 border-slate-50 dark:border-black"></span>
                            </span>
                        </button>
                    </Menu.Target>

                    <Menu.Dropdown className="bg-white dark:bg-[#18181c] border border-stone-200 dark:border-[#2d2d30] p-1.5 rounded-xl shadow-2xl z-50">
                        <div className="px-3 py-2 select-none border-b border-stone-100 dark:border-stone-800/60 mb-1.5 flex flex-col gap-0.5 max-w-[200px]">
                            {displayName && (
                                <div className="flex items-center gap-1.5">
                                    <Text size="xs" className="font-extrabold text-stone-850 dark:text-stone-100 font-sans tracking-tight truncate">
                                        {displayName}
                                    </Text>
                                    {user.app_metadata?.provider === 'google' && (
                                        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 select-none shrink-0 bg-blue-50 dark:bg-blue-900/30 px-1 py-0.2 rounded border border-blue-100 dark:border-blue-900/40">G</span>
                                    )}
                                </div>
                            )}
                            <Text size="10px" className="font-mono text-stone-500 dark:text-gray-400 truncate">
                                {user.email}
                            </Text>
                        </div>

                        <Menu.Item
                            onClick={() => {
                                setErrorMsg(null);
                                setConfirmPurge(false);
                                setIsForgotPassword(false);
                                setOpened(true);
                            }}
                            leftSection={<Cloud size={14} className="text-stone-500 dark:text-gray-400" />}
                            className="hover:bg-stone-100 dark:hover:bg-white/5 text-xs text-stone-700 dark:text-white rounded-lg transition-colors p-2 font-sans"
                        >
                            Account Settings
                        </Menu.Item>

                        <Menu.Item
                            onClick={handleSignOut}
                            leftSection={<LogOut size={14} className="text-stone-500 dark:text-gray-400" />}
                            className="hover:bg-stone-100 dark:hover:bg-white/5 text-xs text-stone-700 dark:text-white rounded-lg transition-colors p-2 font-sans"
                        >
                            Sign Out
                        </Menu.Item>

                        <Menu.Divider className="border-stone-100 dark:border-stone-800/60 my-1" />

                        <Menu.Item
                            onClick={() => {
                                setErrorMsg(null);
                                setConfirmPurge(true);
                                setIsForgotPassword(false);
                                setOpened(true);
                            }}
                            color="red"
                            leftSection={<Trash2 size={14} className="text-red-500" />}
                            className="hover:bg-red-50 dark:hover:bg-red-950/20 text-xs text-red-650 dark:text-red-400 rounded-lg transition-colors p-2 font-sans font-semibold"
                        >
                            Delete My Data
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            ) : (
                /* Signed Out: Clearly Labeled "Sign In" Button */
                <Button
                    onClick={() => {
                        setErrorMsg(null);
                        setConfirmPurge(false);
                        setIsForgotPassword(false);
                        setOpened(true);
                    }}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-9 px-4 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 border-none outline-none"
                    title="Sign in to sync history across devices"
                    aria-label="Sign in to sync history across devices"
                >
                    <Cloud size={14} className="text-white shrink-0" />
                    <span className="text-xs font-sans">Sign in</span>
                </Button>
            )}

            {/* Auth / Account Management Modal */}
            <Modal
                opened={opened}
                onClose={() => setOpened(false)}
                title={user ? "Account Settings" : ""}
                withCloseButton={!!user}
                centered
                size="sm"
                classNames={{
                    content: "bg-white dark:bg-[#18181c] text-stone-800 dark:text-white border border-stone-200 dark:border-stone-800/80 rounded-2xl shadow-2xl p-4 flex flex-col font-sans",
                    header: "bg-white dark:bg-[#18181c] text-stone-800 dark:text-white border-b border-stone-100 dark:border-stone-800/60 pb-3",
                    title: "font-black font-sans text-base tracking-tight text-stone-900 dark:text-white"
                }}
            >
                <div className="relative p-1">
                    <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ blur: 2 }} />

                    {user ? (
                        /* Logged In View */
                        <Stack gap="md">
                            <Alert color="teal" title="Sync Status: Active" icon={<Cloud size={16} />} classNames={{ root: "rounded-xl border border-teal-200/50 dark:border-teal-900/30" }}>
                                Your canvas solves and history entries are actively synced to secure cloud storage.
                            </Alert>

                            <div>
                                <Text size="xs" c="dimmed" className="font-semibold uppercase tracking-wider mb-1">Signed In As</Text>
                                {displayName && <Text size="sm" className="font-extrabold text-stone-850 dark:text-stone-100">{displayName}</Text>}
                                <Text size="sm" className="font-bold text-teal-600 dark:text-teal-400 font-mono">{user.email}</Text>
                            </div>

                            <Group grow gap="sm" mt="md">
                                <Button 
                                    onClick={handleSignOut} 
                                    variant="outline" 
                                    size="xs"
                                    className="border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/40 rounded-xl px-2"
                                    leftSection={<LogOut size={14} />}
                                >
                                    Sign Out
                                </Button>

                                {confirmPurge ? (
                                    <Button 
                                        onClick={handlePurgeData} 
                                        color="red"
                                        size="xs"
                                        className="bg-red-600 hover:bg-red-700 text-white font-bold border-none rounded-xl px-2"
                                        leftSection={<Trash2 size={14} />}
                                    >
                                        Confirm Delete?
                                    </Button>
                                ) : (
                                    <Button 
                                        onClick={() => setConfirmPurge(true)} 
                                        variant="outline"
                                        size="xs"
                                        className="border-red-200 dark:border-red-900/40 text-red-650 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl px-2"
                                        leftSection={<Trash2 size={14} />}
                                    >
                                        Delete My Data
                                    </Button>
                                )}
                            </Group>
                            {confirmPurge && (
                                <Text size="xs" c="red" className="text-center font-semibold mt-1">
                                    Warning: This will permanently wipe all your synced cloud history rows and sign you out.
                                </Text>
                            )}
                        </Stack>
                    ) : isForgotPassword ? (
                        /* Forgot Password View */
                        <form 
                            key="forgot-password"
                            onSubmit={handleResetPasswordRequest} 
                            className="w-full relative animate-in fade-in slide-in-from-bottom-2 duration-300"
                        >
                            {/* Absolute close button */}
                            <button
                                type="button"
                                onClick={() => setOpened(false)}
                                className="absolute top-0 right-0 p-1 rounded-full text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/40 transition-colors cursor-pointer z-50"
                                aria-label="Close"
                            >
                                <X size={16} />
                            </button>
                            <Stack gap="sm">
                                <Text size="xs" c="dimmed" className="text-center mb-1 font-medium">
                                    Enter your email address below and we'll send you a secure link to reset your account password.
                                </Text>

                                <TextInput
                                    label="Email Address"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    classNames={{
                                        input: "bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-850 rounded-xl focus:border-teal-500 h-10 px-3",
                                        label: "text-stone-700 dark:text-stone-300 text-xs font-bold mb-1"
                                    }}
                                />

                                <Button 
                                    type="submit" 
                                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-10 mt-2 rounded-xl border-none"
                                >
                                    Send Reset Link
                                </Button>

                                <Text 
                                    size="xs" 
                                    className="self-center cursor-pointer hover:underline mt-2 font-extrabold text-stone-800 dark:text-stone-250"
                                    onClick={() => {
                                        setIsForgotPassword(false);
                                        setErrorMsg(null);
                                    }}
                                >
                                    Back to Sign In
                                </Text>
                            </Stack>
                        </form>
                    ) : (
                        /* Auth / Login View */
                        <Stack 
                            key={isSignUp ? 'signup' : 'signin'}
                            gap="sm" 
                            className="w-full relative animate-in fade-in slide-in-from-bottom-2 duration-300"
                        >
                            {/* Absolute close button */}
                            <button
                                onClick={() => setOpened(false)}
                                className="absolute top-0 right-0 p-1 rounded-full text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/40 transition-colors cursor-pointer z-50"
                                aria-label="Close"
                            >
                                <X size={16} />
                            </button>
                            {/* App Logo & Custom Centered Header */}
                            <div className="flex flex-col items-center select-none mt-1">
                                <div className="flex items-center gap-1.5 mb-2 select-none justify-center">
                                    <span className="text-2xl font-black tracking-tight font-sans">
                                        solve<span className="text-stone-900 dark:text-white">IQ</span>
                                    </span>
                                </div>
                                <Text className="text-xl font-bold font-sans text-stone-900 dark:text-white tracking-tight text-center">
                                    {isSignUp ? 'Sign up to continue' : 'Sign in to continue'}
                                </Text>
                                <Text size="xs" className="text-center mt-1.5 mb-4 font-medium text-stone-500 dark:text-stone-400 leading-relaxed px-2">
                                    {isSignUp 
                                        ? 'Please sign up to start your whiteboard synchronization.' 
                                        : 'Please sign in to start your whiteboard synchronization.'
                                    }
                                </Text>
                            </div>

                            {/* Email/Password Form */}
                            <form onSubmit={handleAuth} className="w-full">
                                <Stack gap="sm">
                                    {errorMsg && (
                                        <Alert color="red" title="Error" classNames={{ root: "rounded-xl border border-red-200/50 dark:border-red-950/20" }}>
                                            {errorMsg}
                                        </Alert>
                                    )}

                                    {isSignUp && (
                                        <TextInput
                                            placeholder="Display Name"
                                            value={regDisplayName}
                                            onChange={(e) => setRegDisplayName(e.target.value)}
                                            required
                                            leftSection={<UserIcon size={16} className="text-stone-450 dark:text-stone-500" />}
                                            classNames={{
                                                input: "bg-stone-50 dark:bg-stone-900/50 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-850 rounded-xl focus:border-stone-400 dark:focus:border-stone-600 h-10 px-3",
                                            }}
                                        />
                                    )}

                                    <TextInput
                                        placeholder="Email Address"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        leftSection={<Mail size={16} className="text-stone-450 dark:text-stone-500" />}
                                        classNames={{
                                            input: "bg-stone-50 dark:bg-stone-900/50 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-850 rounded-xl focus:border-stone-400 dark:focus:border-stone-600 h-10 px-3",
                                        }}
                                    />

                                    <PasswordInput
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        leftSection={<Lock size={16} className="text-stone-450 dark:text-stone-500" />}
                                        classNames={{
                                            input: "bg-stone-50 dark:bg-stone-900/50 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-850 rounded-xl focus:border-stone-400 dark:focus:border-stone-600 h-10 px-3",
                                        }}
                                    />
                                    {password && password.length < 6 && (
                                        <Text size="10px" c="red" className="font-semibold -mt-2 pl-1 select-none">
                                            Password must be at least 6 characters.
                                        </Text>
                                    )}

                                    {!isSignUp && (
                                        <Text
                                            size="xs"
                                            className="self-end cursor-pointer hover:underline -mt-2 pr-1 font-bold select-none text-stone-750 dark:text-stone-300"
                                            onClick={() => {
                                                setIsForgotPassword(true);
                                                setErrorMsg(null);
                                            }}
                                        >
                                            Forgot password?
                                        </Text>
                                    )}

                                    <Button 
                                        type="submit" 
                                        className="bg-stone-950 hover:bg-stone-900 dark:bg-white dark:hover:bg-stone-50 text-white dark:text-stone-950 font-bold h-10 mt-2 rounded-xl border-none transition-colors w-full cursor-pointer"
                                    >
                                        {isSignUp ? 'Sign Up' : 'Sign In'}
                                    </Button>
                                </Stack>
                            </form>

                            {/* Or continue with Divider */}
                            <div className="flex items-center my-2 select-none w-full">
                                <div className="flex-grow border-t border-stone-200/80 dark:border-stone-800/40"></div>
                                <span className="px-3 text-[10px] uppercase tracking-wider font-extrabold text-stone-450 dark:text-stone-500">Or continue with</span>
                                <div className="flex-grow border-t border-stone-200/80 dark:border-stone-800/40"></div>
                            </div>

                            {/* Google OAuth Button - Horizontal Bar Style */}
                            <Button 
                                type="button"
                                onClick={handleGoogleSignIn}
                                variant="outline"
                                color="gray"
                                className="border-stone-200 dark:border-stone-800 text-stone-750 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850/40 rounded-xl h-10 font-bold w-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                leftSection={<GoogleIcon className="w-4 h-4" />}
                            >
                                Continue with Google
                            </Button>

                            {/* Switch mode footer link */}
                            <Text 
                                size="xs" 
                                className="text-center mt-4 font-semibold w-full text-stone-500 dark:text-stone-400 select-none"
                            >
                                {isSignUp ? (
                                    <>
                                        Already have an account?{' '}
                                        <span 
                                            onClick={() => {
                                                setIsSignUp(false);
                                                setErrorMsg(null);
                                            }}
                                            className="underline cursor-pointer font-bold text-stone-900 dark:text-white hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                                        >
                                            Log In
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        Don't have an account?{' '}
                                        <span 
                                            onClick={() => {
                                                setIsSignUp(true);
                                                setErrorMsg(null);
                                            }}
                                            className="underline cursor-pointer font-bold text-stone-900 dark:text-white hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                                        >
                                            Sign Up
                                        </span>
                                    </>
                                )}
                            </Text>
                        </Stack>
                    )}
                </div>
            </Modal>
        </div>
    );
}

const GoogleIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
);
