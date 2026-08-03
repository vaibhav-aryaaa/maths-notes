import React, { useState } from 'react';
import { Modal, TextInput, PasswordInput, Button, Text, Group, Stack, Alert, LoadingOverlay } from '@mantine/core';
import { supabase } from '@/lib/supabase';
import { notifications } from '@mantine/notifications';
import { LogOut, Trash2, Cloud } from 'lucide-react';

interface AuthManagerProps {
    user: any;
    clearHistory: () => Promise<void>;
}

export function AuthManager({ user, clearHistory }: AuthManagerProps) {
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

    return (
        <>
            {/* Unobtrusive Toolbar Sync Button */}
            <Button
                onClick={() => {
                    setErrorMsg(null);
                    setConfirmPurge(false);
                    setOpened(true);
                }}
                className={`bg-white dark:bg-[#2c2c2c]/50 hover:bg-slate-50 dark:hover:bg-[#3c3c3c] text-stone-700 dark:text-white border border-stone-200 dark:border-[#444] p-1.5 rounded-lg flex items-center justify-center h-8 w-8 transition-all hover:scale-105 active:scale-95 cursor-pointer relative`}
                variant="default"
                title={user ? `Signed in as ${user.email} (Sync Active)` : 'Sign in to sync history across devices'}
            >
                <Cloud size={14} className={user ? 'text-teal-500' : 'text-stone-500 dark:text-gray-300'} />
                {user && (
                    <span className="absolute bottom-1 right-1 flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
                    </span>
                )}
            </Button>

            {/* Auth / Account Management Modal */}
            <Modal
                opened={opened}
                onClose={() => setOpened(false)}
                title={user ? "Account & Synchronization Settings" : "Enable Cross-Device Sync"}
                centered
                size="sm"
                styles={{
                    content: {
                        backdropFilter: 'blur(16px)',
                        backgroundColor: 'rgba(28, 25, 23, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: 'white',
                        borderRadius: '16px'
                    },
                    header: {
                        backgroundColor: 'rgba(28, 25, 23, 0.85)',
                        color: 'white',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                    },
                    title: {
                        fontWeight: 'bold',
                    }
                }}
            >
                <div className="relative p-2">
                    <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ blur: 2 }} />

                    {user ? (
                        /* Logged In View */
                        <Stack gap="md">
                            <Alert color="teal" title="Sync Status: Active" icon={<Cloud size={16} />}>
                                Your canvas solves and history entries are actively synced to secure cloud storage.
                            </Alert>

                            <div>
                                <Text size="xs" c="dimmed">SIGNED IN AS</Text>
                                <Text size="sm" className="font-bold text-teal-400">{user.email}</Text>
                            </div>

                            <Group grow gap="sm" mt="md">
                                <Button 
                                    onClick={handleSignOut} 
                                    color="stone" 
                                    variant="outline" 
                                    className="border-stone-500 text-stone-300 hover:bg-stone-800"
                                    leftSection={<LogOut size={14} />}
                                >
                                    Sign Out
                                </Button>

                                {confirmPurge ? (
                                    <Button 
                                        onClick={handlePurgeData} 
                                        color="red"
                                        className="bg-red-600 hover:bg-red-700"
                                        leftSection={<Trash2 size={14} />}
                                    >
                                        Confirm Delete?
                                    </Button>
                                ) : (
                                    <Button 
                                        onClick={() => setConfirmPurge(true)} 
                                        color="red" 
                                        variant="outline"
                                        className="border-red-500 text-red-400 hover:bg-red-950/20"
                                        leftSection={<Trash2 size={14} />}
                                    >
                                        Delete My Data
                                    </Button>
                                )}
                            </Group>
                            {confirmPurge && (
                                <Text size="xs" c="red" className="text-center">
                                    Warning: This will permanently wipe all your synced cloud history rows and sign you out.
                                </Text>
                            )}
                        </Stack>
                    ) : (
                        /* Auth / Login View */
                        <form onSubmit={handleAuth}>
                            <Stack gap="sm">
                                <Text size="xs" c="dimmed" className="text-center mb-1">
                                    Sign up or log in to automatically upload your local canvas calculations and sync them across all your browsers and devices.
                                </Text>

                                {errorMsg && (
                                    <Alert color="red" title="Error">
                                        {errorMsg}
                                    </Alert>
                                )}

                                <TextInput
                                    label="Email Address"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    styles={{
                                        input: { backgroundColor: '#2c2c2c', color: 'white', border: '1px solid #444' },
                                        label: { color: '#ccc', fontSize: '12px' }
                                    }}
                                />

                                <PasswordInput
                                    label="Password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    styles={{
                                        input: { backgroundColor: '#2c2c2c', color: 'white', border: '1px solid #444' },
                                        label: { color: '#ccc', fontSize: '12px' }
                                    }}
                                />

                                <Button 
                                    type="submit" 
                                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-10 mt-2"
                                >
                                    {isSignUp ? 'Create Sync Account' : 'Log In & Sync'}
                                </Button>

                                <Text 
                                    size="xs" 
                                    c="teal" 
                                    className="text-center cursor-pointer hover:underline mt-2 font-bold"
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
        </>
    );
}
