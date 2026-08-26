import React, { useState } from 'react';
import { PasswordInput, Button, Text, Stack, Alert, LoadingOverlay, Container, Paper } from '@mantine/core';
import { supabase } from '@/lib/supabase';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // If Supabase is not configured, don't show the reset password controls
    if (!supabase) {
        return null;
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (password.length < 6) {
            setErrorMsg("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setErrorMsg("Passwords do not match.");
            return;
        }

        setLoading(true);
        setErrorMsg(null);

        try {
            const { error } = await supabase!.auth.updateUser({
                password: password
            });
            if (error) throw error;

            notifications.show({
                title: 'Password Reset Successfully',
                message: 'Your password has been successfully updated. You are now signed in.',
                color: 'green',
            });
            navigate('/', { replace: true });
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to reset password. Please try requesting a new reset link.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container size="xs" className="h-screen flex items-center justify-center font-sans">
            <Paper className="bg-white dark:bg-[#18181c] border border-stone-200 dark:border-stone-800/80 p-6 rounded-2xl shadow-2xl w-full relative">
                <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ blur: 2 }} />

                <Stack gap="md">
                    <div className="text-center">
                        <Text className="text-lg font-bold text-stone-850 dark:text-stone-100">Set New Password</Text>
                        <Text size="xs" c="dimmed" mt="xs">
                            Choose a strong, secure password for your account.
                        </Text>
                    </div>

                    {errorMsg && (
                        <Alert color="red" title="Error" classNames={{ root: "rounded-xl border border-red-200/50 dark:border-red-950/20" }}>
                            {errorMsg}
                        </Alert>
                    )}

                    <form onSubmit={handleResetPassword}>
                        <Stack gap="sm">
                            <PasswordInput
                                label="New Password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                classNames={{
                                    input: "bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-850 rounded-xl focus:border-teal-500 h-10 px-3",
                                    label: "text-stone-700 dark:text-stone-300 text-xs font-bold mb-1"
                                }}
                            />
                            {password && password.length < 6 && (
                                <Text size="10px" c="red" className="font-semibold -mt-2 pl-1 select-none">
                                    Password must be at least 6 characters.
                                </Text>
                            )}

                            <PasswordInput
                                label="Confirm New Password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                classNames={{
                                    input: "bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-850 rounded-xl focus:border-teal-500 h-10 px-3",
                                    label: "text-stone-700 dark:text-stone-300 text-xs font-bold mb-1"
                                }}
                            />

                            <Button 
                                type="submit" 
                                className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-10 mt-3 rounded-xl border-none w-full"
                            >
                                Update Password
                            </Button>
                        </Stack>
                    </form>
                </Stack>
            </Paper>
        </Container>
    );
}
