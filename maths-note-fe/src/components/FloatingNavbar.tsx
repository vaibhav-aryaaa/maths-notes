import React from 'react';
import { Link } from 'react-router-dom';
import {
    BookOpen,
    Folder as FolderIcon,
    Trash2,
    Search,
    LayoutGrid,
    List as ListIcon,
    Sun,
    Moon,
    Plus,
    FilePlus,
    FolderPlus,
    ChevronDown,
    Heart,
    X,
    ArrowLeft
} from 'lucide-react';
import { Menu, Tooltip } from '@mantine/core';
import { AuthManager } from '@/components/AuthManager';
import type { User } from '@supabase/supabase-js';
import type { Folder } from '@/lib/canvasesApi';

export interface FloatingNavbarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    activeTab: 'all' | 'trash';
    onTabChange: (tab: 'all' | 'trash') => void;
    currentFolder?: Folder | null;
    folders?: Folder[];
    notebookCount?: number;
    trashCount?: number;
    onSelectFolder?: (folderId: string | null) => void;
    viewMode: 'grid' | 'list';
    onToggleViewMode: () => void;
    showFavoritesOnly?: boolean;
    onToggleFavorites?: () => void;
    onCreateCanvas: () => void;
    onCreateFolder: () => void;
    user?: User | null;
    clearHistory?: () => Promise<void>;
    colorScheme: 'light' | 'dark';
    onToggleColorScheme: () => void;
}

export const FloatingNavbar: React.FC<FloatingNavbarProps> = ({
    searchQuery,
    onSearchChange,
    activeTab,
    onTabChange,
    currentFolder = null,
    folders = [],
    notebookCount,
    trashCount,
    onSelectFolder,
    viewMode,
    onToggleViewMode,
    showFavoritesOnly = false,
    onToggleFavorites,
    onCreateCanvas,
    onCreateFolder,
    user = null,
    clearHistory = async () => {},
    colorScheme,
    onToggleColorScheme
}) => {
    return (
        <header className="sticky top-4 sm:top-5 z-40 w-full max-w-[1440px] mx-auto px-4 sm:px-8 pointer-events-none transition-all">
            <div className="pointer-events-auto w-full rounded-full bg-white/80 dark:bg-[#121215]/80 backdrop-blur-2xl border border-black/[0.05] dark:border-white/[0.08] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-[0_16px_50px_-8px_rgba(0,0,0,0.6),0_1px_3px_rgba(255,255,255,0.04)] px-4 py-2 sm:px-5 sm:py-2.5 flex items-center justify-between gap-4 sm:gap-6 md:gap-8 transition-all">
                {/* Left Section: Logo & Library Dropdown */}
                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <Link to="/" className="group flex items-center select-none text-decoration-none pl-1 sm:pl-2">
                        <span className="text-lg sm:text-xl font-black tracking-tight text-stone-900 dark:text-white group-hover:opacity-90 transition-opacity">
                            solve<span className="text-amber-500">IQ</span>
                        </span>
                    </Link>

                    {/* Library Dropdown / Breadcrumbs */}
                    <Menu position="bottom-start" shadow="lg" radius="md">
                        <Menu.Target>
                            <button
                                type="button"
                                className="h-9 px-3.5 rounded-full bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 flex items-center gap-2 text-xs font-semibold text-stone-750 dark:text-stone-200 hover:text-stone-950 dark:hover:text-white transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)] select-none"
                                aria-label="Library Navigation Menu"
                            >
                                <BookOpen size={14} className="text-stone-500 dark:text-stone-400 shrink-0" />
                                <span className="max-w-[120px] sm:max-w-[160px] truncate">
                                    {activeTab === 'trash' ? 'Trash' : (currentFolder ? currentFolder.name : 'Library')}
                                </span>
                                <ChevronDown size={12} className="text-stone-400 dark:text-stone-500 shrink-0 ml-0.5" />
                            </button>
                        </Menu.Target>
                        <Menu.Dropdown className="bg-white dark:bg-[#18181c] border border-stone-200 dark:border-stone-800 p-2 rounded-2xl shadow-2xl z-50 min-w-[220px]">
                            {currentFolder && (
                                <Menu.Item
                                    leftSection={<ArrowLeft size={14} />}
                                    onClick={() => {
                                        onTabChange('all');
                                        onSelectFolder?.(null);
                                    }}
                                    className="text-xs font-semibold rounded-xl text-teal-600 dark:text-teal-400 p-2"
                                >
                                    Back to Root Library
                                </Menu.Item>
                            )}

                            <Menu.Item
                                leftSection={<BookOpen size={14} />}
                                onClick={() => {
                                    onTabChange('all');
                                    onSelectFolder?.(null);
                                }}
                                className={`text-xs font-semibold rounded-xl p-2 ${activeTab === 'all' && !currentFolder ? 'bg-stone-100 dark:bg-stone-800 font-bold text-stone-950 dark:text-white' : ''}`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span>All Notebooks</span>
                                    {notebookCount !== undefined && (
                                        <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-2">({notebookCount})</span>
                                    )}
                                </div>
                            </Menu.Item>

                            <Menu.Item
                                leftSection={<Trash2 size={14} />}
                                onClick={() => onTabChange('trash')}
                                className={`text-xs font-semibold rounded-xl text-red-500 hover:text-red-600 p-2 ${activeTab === 'trash' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span>Trash</span>
                                    {trashCount !== undefined && (
                                        <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-2">({trashCount})</span>
                                    )}
                                </div>
                            </Menu.Item>

                            {folders.length > 0 && (
                                <>
                                    <Menu.Divider className="my-1.5 border-stone-100 dark:border-stone-800" />
                                    <Menu.Label className="text-[10px] uppercase font-bold tracking-wider text-stone-400 px-2 py-1">Folders</Menu.Label>
                                    {folders.map(f => (
                                        <Menu.Item
                                            key={f.id}
                                            leftSection={<FolderIcon size={14} className="text-amber-500 shrink-0" />}
                                            onClick={() => {
                                                onTabChange('all');
                                                onSelectFolder?.(f.id);
                                            }}
                                            className={`text-xs rounded-xl p-2 ${currentFolder?.id === f.id ? 'font-bold bg-stone-100 dark:bg-stone-800 text-teal-600 dark:text-teal-400' : 'text-stone-700 dark:text-stone-300'}`}
                                        >
                                            <span className="truncate max-w-[170px] block">{f.name}</span>
                                        </Menu.Item>
                                    ))}
                                </>
                            )}
                        </Menu.Dropdown>
                    </Menu>
                </div>

                {/* Center Section: Inset Search Bar (Ultra-Low Opacity Frosted Glass) */}
                <div className="flex-1 max-w-2xl mx-1 sm:mx-4 md:mx-6 relative flex items-center h-9 rounded-full bg-black/[0.015] hover:bg-black/[0.025] dark:bg-white/[0.02] dark:hover:bg-white/[0.035] backdrop-blur-md border border-black/[0.04] dark:border-white/[0.05] focus-within:bg-white/50 dark:focus-within:bg-white/[0.05] focus-within:border-amber-500/30 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all pl-4 pr-1">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search notebooks, models, datasets..."
                        className="w-full bg-transparent border-none outline-none text-[11px] sm:text-[11.5px] text-stone-850 dark:text-stone-100 placeholder:text-stone-400/75 dark:placeholder:text-stone-500/75 font-normal tracking-[0.01em] mr-2"
                    />
                    {searchQuery ? (
                        <button
                            type="button"
                            onClick={() => onSearchChange('')}
                            className="w-7 h-7 rounded-full text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                            title="Clear search"
                            aria-label="Clear search"
                        >
                            <X size={13} />
                        </button>
                    ) : (
                        <div
                            className="w-7 h-7 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 flex items-center justify-center shrink-0 shadow-xs select-none"
                            title="Search"
                        >
                            <Search size={13} strokeWidth={2.5} />
                        </div>
                    )}
                </div>

                {/* Right Section: View Mode, Favorites, Theme, + New, Profile */}
                <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3 shrink-0">
                    {/* View Mode Toggle */}
                    <Tooltip label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}>
                        <button
                            type="button"
                            onClick={onToggleViewMode}
                            className="w-9 h-9 rounded-full bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 flex items-center justify-center text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-95 cursor-pointer select-none"
                            aria-label="Toggle layout view"
                        >
                            {viewMode === 'grid' ? <ListIcon size={15} /> : <LayoutGrid size={15} />}
                        </button>
                    </Tooltip>

                    {/* Favorites Filter Button */}
                    {onToggleFavorites && (
                        <Tooltip label={showFavoritesOnly ? 'Show all notebooks' : 'Filter favorites'}>
                            <button
                                type="button"
                                onClick={onToggleFavorites}
                                className={`w-9 h-9 rounded-full border transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-95 cursor-pointer select-none flex items-center justify-center ${
                                    showFavoritesOnly
                                        ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-500'
                                        : 'bg-white dark:bg-stone-900 border-stone-200/70 dark:border-stone-800 text-stone-400 hover:text-rose-500 hover:border-rose-200'
                                }`}
                                aria-label="Toggle favorites filter"
                            >
                                <Heart size={15} className={showFavoritesOnly ? 'fill-rose-500 text-rose-500' : 'text-rose-500'} />
                            </button>
                        </Tooltip>
                    )}

                    {/* Theme Toggle */}
                    <Tooltip label={colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                        <button
                            type="button"
                            onClick={onToggleColorScheme}
                            className="w-9 h-9 rounded-full bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 flex items-center justify-center text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] active:scale-95 cursor-pointer select-none"
                            aria-label="Toggle color scheme"
                        >
                            {colorScheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>
                    </Tooltip>

                    {/* + New Button with Menu */}
                    <Menu position="bottom-end" shadow="lg" radius="md">
                        <Menu.Target>
                            <button
                                type="button"
                                className="h-9 px-4 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-[0_4px_16px_rgba(234,88,12,0.25)] hover:shadow-[0_6px_20px_rgba(234,88,12,0.35)] active:scale-95 transition-all cursor-pointer border-none outline-none select-none shrink-0"
                                aria-label="Create new notebook or folder"
                            >
                                <Plus size={14} strokeWidth={2.5} />
                                <span>New</span>
                                <ChevronDown size={11} className="opacity-80 -ml-0.5" />
                            </button>
                        </Menu.Target>
                        <Menu.Dropdown className="bg-white dark:bg-[#18181c] border border-stone-200 dark:border-stone-800 p-2 rounded-2xl shadow-2xl z-50 min-w-[180px]">
                            <Menu.Item
                                leftSection={<FilePlus size={15} className="text-orange-500" />}
                                onClick={onCreateCanvas}
                                className="text-xs font-semibold rounded-xl p-2.5"
                            >
                                New Notebook
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<FolderPlus size={15} className="text-teal-500" />}
                                onClick={onCreateFolder}
                                className="text-xs font-semibold rounded-xl p-2.5"
                            >
                                New Folder
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>

                    {/* Profile Capsule (AuthManager with pillTrigger) */}
                    <AuthManager
                        user={user}
                        clearHistory={clearHistory}
                        pillTrigger={true}
                    />
                </div>
            </div>
        </header>
    );
};
