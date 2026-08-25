import React, { useState } from 'react';
import { Modal, TextInput, PasswordInput, Button, Text, Group, Stack, Alert, LoadingOverlay, Menu } from '@mantine/core';
import { supabase } from '@/lib/supabase';
import { notifications } from '@mantine/notifications';
import { LogOut, Trash2, Cloud } from 'lucide-react';

import type { User } from '@supabase/supabase-js';

interface AuthManagerProps {
    user: User | null;
    clearHistory: () => Promise<void>;
    isFocusMode?: boolean;
}

export function AuthManager({ user, clearHistory, isFocusMode = false }: AuthManagerProps) {
    const [opened, setOpened] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [confirmPurge, setConfirmPurge] = useState(false);

    // If Supabase is not configured, don't show the auth controls
    if (!supabase) {
        return null;
    }

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);

        try {
            if (isSignUp) {
                const { data, error } = await supabase!.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                
                notifications.show({
                    title: 'Account Created!',
                    message: data.session 
                        ? 'You have been registered and signed in automatically.' 
                        : 'Registration successful! Please check your email for verification if required.',
                    color: 'green',
                });
                if (data.session) {
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
        } catch (err: any) {
            setErrorMsg(err.message || 'An error occurred during authentication.');
        } finally {
            setLoading(false);
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
                /* Signed In: Initials-based Avatar with Dropdown Menu */
                <Menu shadow="md" width={220} position="bottom-end" transitionProps={{ transition: 'fade', duration: 150 }}>
                    <Menu.Target>
                        <button
                            className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-9 w-9 rounded-full flex items-center justify-center cursor-pointer shadow-md select-none hover:scale-105 active:scale-95 transition-all font-sans text-sm border-none outline-none relative"
                            title={`Signed in as ${user.email}`}
                            aria-label={`Signed in as ${user.email}`}
                        >
                            {getInitials()}
                            <span className="absolute bottom-0 right-0 flex h-2 w-2">
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400 border border-amber-500"></span>
                            </span>
                        </button>
                    </Menu.Target>

                    <Menu.Dropdown className="bg-white dark:bg-[#18181c] border border-stone-200 dark:border-[#2d2d30] p-1.5 rounded-xl shadow-2xl z-50">
                        <div className="px-3 py-2 select-none border-b border-stone-100 dark:border-stone-800/60 mb-1.5 flex flex-col gap-0.5 max-w-[200px]">
                            {displayName && (
                                <Text size="xs" className="font-extrabold text-stone-850 dark:text-stone-100 font-sans tracking-tight truncate">
                                    {displayName}
                                </Text>
                            )}
                            <Text size="10px" className="font-mono text-stone-500 dark:text-gray-400 truncate">
                                {user.email}
                            </Text>
                        </div>

                        <Menu.Item
                            onClick={() => {
                                setErrorMsg(null);
                                setConfirmPurge(false);
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
                title={user ? "Account & Synchronization Settings" : "Enable Cross-Device Sync"}
                centered
                size="sm"
                classNames={{
                    content: "bg-white dark:bg-[#18181c] text-stone-800 dark:text-white border border-stone-200 dark:border-stone-800/80 rounded-2xl shadow-2xl p-4 flex flex-col font-sans",
                    header: "bg-white dark:bg-[#18181c] text-stone-800 dark:text-white border-b border-stone-100 dark:border-stone-800/60 pb-3",
                    title: "font-bold font-sans text-sm"
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
                                    className="border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/40 rounded-xl"
                                    leftSection={<LogOut size={14} />}
                                >
                                    Sign Out
                                </Button>

                                {confirmPurge ? (
                                    <Button 
                                        onClick={handlePurgeData} 
                                        color="red"
                                        className="bg-red-600 hover:bg-red-700 text-white font-bold border-none rounded-xl"
                                        leftSection={<Trash2 size={14} />}
                                    >
                                        Confirm Delete?
                                    </Button>
                                ) : (
                                    <Button 
                                        onClick={() => setConfirmPurge(true)} 
                                        variant="outline"
                                        className="border-red-200 dark:border-red-900/40 text-red-650 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl"
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
                    ) : (
                        /* Auth / Login View */
                        <form onSubmit={handleAuth}>
                            <Stack gap="sm">
                                <Text size="xs" c="dimmed" className="text-center mb-2 font-medium">
                                    Sign up or log in to automatically upload your local canvas calculations and sync them across all your browsers and devices.
                                </Text>

                                {errorMsg && (
                                    <Alert color="red" title="Error" classNames={{ root: "rounded-xl border border-red-200/50 dark:border-red-950/20" }}>
                                        {errorMsg}
                                    </Alert>
                                )}

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

                                <PasswordInput
                                    label="Password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    classNames={{
                                        input: "bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-850 rounded-xl focus:border-teal-500 h-10 px-3",
                                        label: "text-stone-700 dark:text-stone-300 text-xs font-bold mb-1 font-sans"
                                    }}
                                />

                                <Button 
                                    type="submit" 
                                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-10 mt-2 rounded-xl border-none"
                                >
                                    {isSignUp ? 'Create Sync Account' : 'Log In & Sync'}
                                </Button>

                                <Text 
                                    size="xs" 
                                    c="teal" 
                                    className="text-center cursor-pointer hover:underline mt-2 font-extrabold"
                                    onClick={() => {
                                        setIsSignUp(!isSignUp);
                                        setErrorMsg(null);
                                    }}
                                >
                                    {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
                                </Text>
                            </Stack>
                        </form>
                    )}
                </div>
            </Modal>
        </div>
    );
}
