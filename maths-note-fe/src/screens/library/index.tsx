import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { 
    Folder as FolderIcon, 
    FolderPlus, 
    FilePlus, 
    Trash2, 
    RotateCcw, 
    Edit2, 
    Search, 
    LayoutGrid, 
    List as ListIcon, 
    ChevronRight, 
    ArrowLeft, 
    Clock, 
    MoreVertical, 
    Sparkles, 
    BookOpen, 
    Sun, 
    Moon,
    AlertCircle,
    Check,
    X,
    Flame
} from 'lucide-react';
import { 
    Modal, 
    TextInput, 
    Button, 
    Menu, 
    Loader, 
    Tabs, 
    Badge, 
    Tooltip,
    useMantineColorScheme 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { 
    fetchFolders, 
    fetchCanvasesMetadata, 
    createFolder, 
    createCanvas, 
    updateFolder, 
    updateCanvas, 
    deleteFolder, 
    deleteCanvas, 
    fetchTrash, 
    restoreFolder, 
    restoreCanvas, 
    permanentlyDeleteFolder, 
    permanentlyDeleteCanvas,
    type Folder, 
    type CanvasMetadata,
    type TrashData
} from '@/lib/canvasesApi';
import { AuthManager } from '@/components/AuthManager';
import { useSolveHistory } from '@/hooks/useSolveHistory';

export default function LibraryScreen() {
    const navigate = useNavigate();
    const { folderId: routeFolderId } = useParams<{ folderId?: string }>();
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const { clearHistory } = useSolveHistory();

    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [folders, setFolders] = useState<Folder[]>([]);
    const [canvases, setCanvases] = useState<CanvasMetadata[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    // Active folder scope
    const currentFolderId = routeFolderId || null;

    // View layout
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');

    // Modal / Action states
    const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [createCanvasModalOpen, setCreateCanvasModalOpen] = useState(false);
    const [newCanvasName, setNewCanvasName] = useState('');

    // Inline renaming
    const [editingId, setEditingId] = useState<string | null>(null);
    const [_editingType, setEditingType] = useState<'folder' | 'canvas' | null>(null);
    const [editingName, setEditingName] = useState('');

    // Trash View
    const [activeTab, setActiveTab] = useState<'all' | 'trash'>('all');
    const [trashData, setTrashData] = useState<TrashData>({ folders: [], canvases: [] });
    const [loadingTrash, setLoadingTrash] = useState(false);

    // 1. Auth Gate: Listen to auth state
    useEffect(() => {
        if (!supabase) {
            navigate('/', { replace: true });
            return;
        }

        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                navigate('/', { replace: true });
            } else {
                setUser(user);
            }
            setAuthLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session?.user) {
                navigate('/', { replace: true });
            } else {
                setUser(session.user);
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate]);

    useEffect(() => {
        if (!user) return;
        let isMounted = true;
        if (activeTab === 'all') {
            Promise.all([
                fetchFolders(),
                fetchCanvasesMetadata(currentFolderId),
            ]).then(([fetchedFolders, fetchedCanvases]) => {
                if (isMounted) {
                    setFolders(fetchedFolders);
                    setCanvases(fetchedCanvases);
                    setLoadingData(false);
                }
            }).catch(err => {
                console.error(err);
                if (isMounted) setLoadingData(false);
            });
        } else {
            fetchTrash().then(data => {
                if (isMounted) {
                    setTrashData(data);
                    setLoadingTrash(false);
                }
            }).catch(err => {
                console.error(err);
                if (isMounted) setLoadingTrash(false);
            });
        }
        return () => {
            isMounted = false;
        };
    }, [user, currentFolderId, activeTab]);

    // Find current folder metadata for breadcrumb
    const currentFolder = useMemo(() => {
        if (!currentFolderId) return null;
        return folders.find(f => f.id === currentFolderId) || null;
    }, [folders, currentFolderId]);

    // Filter items by search
    const filteredFolders = useMemo(() => {
        if (currentFolderId) return []; // Folders are only shown at root
        if (!searchQuery.trim()) return folders;
        return folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [folders, currentFolderId, searchQuery]);

    const filteredCanvases = useMemo(() => {
        if (!searchQuery.trim()) return canvases;
        return canvases.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [canvases, searchQuery]);

    // Format relative time helper
    const formatTime = (dateStr?: string) => {
        if (!dateStr) return 'Recently';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    // Handlers
    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        try {
            const folder = await createFolder(newFolderName.trim());
            setFolders(prev => [...prev, folder]);
            setNewFolderName('');
            setCreateFolderModalOpen(false);
            notifications.show({
                title: 'Folder created',
                message: `Created "${folder.name}"`,
                color: 'teal',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Failed to create folder',
                message: err.message || 'Error occurred',
                color: 'red',
            });
        }
    };

    const handleCreateCanvas = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = newCanvasName.trim() || 'Untitled Notebook';
        try {
            const newCanvas = await createCanvas({
                name,
                folder_id: currentFolderId,
            });
            setCreateCanvasModalOpen(false);
            setNewCanvasName('');
            navigate(`/canvas/${newCanvas.id}`);
        } catch (err: any) {
            notifications.show({
                title: 'Failed to create notebook',
                message: err.message || 'Error occurred',
                color: 'red',
            });
        }
    };

    const handleStartRename = (id: string, type: 'folder' | 'canvas', currentName: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setEditingId(id);
        setEditingType(type);
        setEditingName(currentName);
    };

    const handleSaveRename = async (id: string, type: 'folder' | 'canvas') => {
        if (!editingName.trim()) {
            setEditingId(null);
            return;
        }
        try {
            if (type === 'folder') {
                await updateFolder(id, editingName.trim());
                setFolders(prev => prev.map(f => f.id === id ? { ...f, name: editingName.trim() } : f));
            } else {
                await updateCanvas(id, { name: editingName.trim() });
                setCanvases(prev => prev.map(c => c.id === id ? { ...c, name: editingName.trim() } : c));
            }
            notifications.show({
                title: 'Renamed',
                message: `Saved as "${editingName.trim()}"`,
                color: 'teal',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Rename failed',
                message: err.message || 'Could not update name',
                color: 'red',
            });
        } finally {
            setEditingId(null);
        }
    };

    const handleDeleteFolder = async (folder: Folder, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            await deleteFolder(folder.id);
            setFolders(prev => prev.filter(f => f.id !== folder.id));
            notifications.show({
                title: 'Folder moved to trash',
                message: `"${folder.name}" moved to trash. Any notebooks inside are moved to root.`,
                color: 'blue',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Delete failed',
                message: err.message || 'Could not delete folder',
                color: 'red',
            });
        }
    };

    const handleDeleteCanvas = async (canvas: CanvasMetadata, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            await deleteCanvas(canvas.id);
            setCanvases(prev => prev.filter(c => c.id !== canvas.id));
            notifications.show({
                title: 'Notebook moved to trash',
                message: `"${canvas.name}" was moved to trash.`,
                color: 'blue',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Delete failed',
                message: err.message || 'Could not delete notebook',
                color: 'red',
            });
        }
    };

    // Trash actions
    const handleRestoreFolder = async (folderId: string) => {
        try {
            await restoreFolder(folderId);
            setTrashData(prev => ({
                ...prev,
                folders: prev.folders.filter(f => f.id !== folderId),
            }));
            notifications.show({
                title: 'Folder restored',
                message: 'Folder has been restored to your library.',
                color: 'teal',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Restore failed',
                message: err.message || 'Could not restore folder',
                color: 'red',
            });
        }
    };

    const handleRestoreCanvas = async (canvasId: string) => {
        try {
            await restoreCanvas(canvasId);
            setTrashData(prev => ({
                ...prev,
                canvases: prev.canvases.filter(c => c.id !== canvasId),
            }));
            notifications.show({
                title: 'Notebook restored',
                message: 'Notebook has been restored to your library.',
                color: 'teal',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Restore failed',
                message: err.message || 'Could not restore notebook',
                color: 'red',
            });
        }
    };

    const handlePermanentDeleteFolder = async (folderId: string) => {
        try {
            await permanentlyDeleteFolder(folderId);
            setTrashData(prev => ({
                ...prev,
                folders: prev.folders.filter(f => f.id !== folderId),
            }));
            notifications.show({
                title: 'Folder deleted forever',
                message: 'Folder was permanently removed.',
                color: 'red',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Delete failed',
                message: err.message || 'Could not permanently delete folder',
                color: 'red',
            });
        }
    };

    const handlePermanentDeleteCanvas = async (canvasId: string) => {
        try {
            await permanentlyDeleteCanvas(canvasId);
            setTrashData(prev => ({
                ...prev,
                canvases: prev.canvases.filter(c => c.id !== canvasId),
            }));
            notifications.show({
                title: 'Notebook deleted forever',
                message: 'Notebook was permanently deleted.',
                color: 'red',
            });
        } catch (err: any) {
            notifications.show({
                title: 'Delete failed',
                message: err.message || 'Could not permanently delete notebook',
                color: 'red',
            });
        }
    };

    if (authLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#0c0c0e]">
                <Loader color="teal" size="lg" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0c0c0e] text-slate-900 dark:text-stone-100 flex flex-col font-sans transition-colors duration-200">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 dark:border-stone-800/80 bg-white/80 dark:bg-[#121214]/80 px-6 py-3.5 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <Link to="/" className="flex items-center gap-2 group cursor-pointer select-none">
                        <span className="text-xl font-black tracking-tight font-sans text-stone-900 dark:text-white">
                            solve<span className="text-amber-500">IQ</span>
                        </span>
                        <Badge variant="light" color="teal" size="sm" className="font-semibold tracking-wide">
                            Library
                        </Badge>
                    </Link>

                    <div className="h-4 w-[1px] bg-stone-300 dark:bg-stone-700" />

                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                        <button
                            onClick={() => navigate('/library')}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors cursor-pointer border-none bg-transparent ${
                                !currentFolderId 
                                    ? 'font-bold text-stone-900 dark:text-white' 
                                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                            }`}
                        >
                            <BookOpen size={16} />
                            <span>My Notebooks</span>
                        </button>
                        {currentFolder && (
                            <>
                                <ChevronRight size={14} className="text-stone-400 dark:text-stone-600" />
                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg font-bold text-teal-600 dark:text-teal-400">
                                    <FolderIcon size={16} />
                                    <span>{currentFolder.name}</span>
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Right controls: Theme, Actions, User */}
                <div className="flex items-center gap-3">
                    <Tooltip label={colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                        <button
                            onClick={() => toggleColorScheme()}
                            className="p-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                        >
                            {colorScheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                        </button>
                    </Tooltip>

                    <Button
                        leftSection={<FilePlus size={16} />}
                        onClick={() => setCreateCanvasModalOpen(true)}
                        className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-sm border-none cursor-pointer text-xs h-9 px-3.5"
                    >
                        New Notebook
                    </Button>

                    {!currentFolderId && (
                        <Button
                            leftSection={<FolderPlus size={16} />}
                            variant="default"
                            onClick={() => setCreateFolderModalOpen(true)}
                            className="border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 font-bold rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 shadow-sm cursor-pointer text-xs h-9 px-3.5"
                        >
                            New Folder
                        </Button>
                    )}

                    <AuthManager user={user} clearHistory={clearHistory} />
                </div>
            </header>

            {/* Main Library Container */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col gap-6">
                {/* Tabs, Search & Layout Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <Tabs value={activeTab} onChange={(val) => setActiveTab((val as 'all' | 'trash') || 'all')} variant="pills">
                        <Tabs.List className="bg-stone-200/60 dark:bg-stone-900/60 p-1 rounded-xl border border-stone-200/50 dark:border-stone-800/40">
                            <Tabs.Tab 
                                value="all" 
                                leftSection={<BookOpen size={15} />}
                                className="rounded-lg text-xs font-bold px-3 py-1.5 data-[active]:bg-white dark:data-[active]:bg-stone-800 data-[active]:text-stone-900 dark:data-[active]:text-white shadow-none"
                            >
                                All Items
                            </Tabs.Tab>
                            <Tabs.Tab 
                                value="trash" 
                                leftSection={<Trash2 size={15} />}
                                className="rounded-lg text-xs font-bold px-3 py-1.5 data-[active]:bg-white dark:data-[active]:bg-stone-800 data-[active]:text-red-500 shadow-none"
                            >
                                Trash
                            </Tabs.Tab>
                        </Tabs.List>
                    </Tabs>

                    {activeTab === 'all' && (
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <TextInput
                                placeholder="Search notebooks and folders..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                leftSection={<Search size={15} className="text-stone-400" />}
                                className="w-full sm:w-64"
                                classNames={{
                                    input: 'bg-white dark:bg-[#18181c] border-stone-200 dark:border-stone-800 rounded-xl text-xs h-9',
                                }}
                            />

                            <div className="flex items-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#18181c] p-0.5">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-lg border-none cursor-pointer transition-colors ${
                                        viewMode === 'grid' 
                                            ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white font-bold' 
                                            : 'bg-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                                    }`}
                                    title="Grid view"
                                >
                                    <LayoutGrid size={16} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-lg border-none cursor-pointer transition-colors ${
                                        viewMode === 'list' 
                                            ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white font-bold' 
                                            : 'bg-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                                    }`}
                                    title="List view"
                                >
                                    <ListIcon size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Back to Root button when inside folder */}
                {currentFolderId && activeTab === 'all' && (
                    <div>
                        <button
                            onClick={() => navigate('/library')}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0"
                        >
                            <ArrowLeft size={14} />
                            <span>Back to Root Library</span>
                        </button>
                    </div>
                )}

                {/* Content View */}
                {activeTab === 'all' ? (
                    loadingData ? (
                        <div className="flex h-64 w-full items-center justify-center">
                            <Loader color="teal" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {/* Folders Section (Only shown at root) */}
                            {!currentFolderId && filteredFolders.length > 0 && (
                                <section>
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-3">
                                        Folders ({filteredFolders.length})
                                    </h2>
                                    <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" : "flex flex-col gap-2"}>
                                        {filteredFolders.map(folder => (
                                            <div
                                                key={folder.id}
                                                onClick={() => navigate(`/library/folder/${folder.id}`)}
                                                className="group relative flex items-center justify-between p-4 rounded-2xl border border-stone-200 dark:border-stone-800/80 bg-white dark:bg-[#141416] hover:border-teal-500/50 dark:hover:border-teal-500/50 hover:shadow-md transition-all cursor-pointer select-none"
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
                                                        <FolderIcon size={20} />
                                                    </div>
                                                    {editingId === folder.id ? (
                                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                            <TextInput
                                                                value={editingName}
                                                                onChange={(e) => setEditingName(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleSaveRename(folder.id, 'folder');
                                                                    if (e.key === 'Escape') setEditingId(null);
                                                                }}
                                                                size="xs"
                                                                autoFocus
                                                                classNames={{ input: 'h-7 text-xs rounded-lg' }}
                                                            />
                                                            <button 
                                                                onClick={() => handleSaveRename(folder.id, 'folder')}
                                                                className="p-1 text-teal-600 hover:text-teal-700 cursor-pointer bg-transparent border-none"
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                            <button 
                                                                onClick={() => setEditingId(null)}
                                                                className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer bg-transparent border-none"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="overflow-hidden">
                                                            <h3 className="text-sm font-bold text-stone-900 dark:text-white truncate">
                                                                {folder.name}
                                                            </h3>
                                                            <span className="text-[11px] text-stone-400">
                                                                {formatTime(folder.updated_at)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <Menu position="bottom-end" shadow="md">
                                                    <Menu.Target>
                                                        <button
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-none bg-transparent cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        >
                                                            <MoreVertical size={16} />
                                                        </button>
                                                    </Menu.Target>
                                                    <Menu.Dropdown className="bg-white dark:bg-[#18181c] border-stone-200 dark:border-stone-800 text-xs">
                                                        <Menu.Item
                                                            leftSection={<Edit2 size={13} />}
                                                            onClick={(e) => handleStartRename(folder.id, 'folder', folder.name, e)}
                                                        >
                                                            Rename
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            color="red"
                                                            leftSection={<Trash2 size={13} />}
                                                            onClick={(e) => handleDeleteFolder(folder, e)}
                                                        >
                                                            Move to Trash
                                                        </Menu.Item>
                                                    </Menu.Dropdown>
                                                </Menu>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Notebooks Section */}
                            <section>
                                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-3">
                                    Notebooks ({filteredCanvases.length})
                                </h2>

                                {filteredCanvases.length === 0 && filteredFolders.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-12 border border-dashed border-stone-300 dark:border-stone-800 rounded-3xl bg-white/50 dark:bg-[#121214]/50 text-center">
                                        <div className="p-4 rounded-full bg-amber-500/10 text-amber-500 mb-3">
                                            <Sparkles size={28} />
                                        </div>
                                        <h3 className="text-base font-bold text-stone-900 dark:text-white mb-1">
                                            {searchQuery ? 'No matching items found' : 'No notebooks yet'}
                                        </h3>
                                        <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mb-4">
                                            {searchQuery 
                                                ? 'Try clearing your search query to see all notebooks and folders.' 
                                                : 'Create your first notebook to begin solving equations and taking math notes.'}
                                        </p>
                                        {!searchQuery && (
                                            <Button
                                                leftSection={<FilePlus size={15} />}
                                                onClick={() => setCreateCanvasModalOpen(true)}
                                                className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs h-9 border-none cursor-pointer"
                                            >
                                                Create Notebook
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5" : "flex flex-col gap-2.5"}>
                                        {filteredCanvases.map(canvas => (
                                            <div
                                                key={canvas.id}
                                                onClick={() => navigate(`/canvas/${canvas.id}`)}
                                                className={`group relative flex rounded-2xl border border-stone-200 dark:border-stone-800/80 bg-white dark:bg-[#141416] hover:border-amber-500/60 dark:hover:border-amber-500/60 hover:shadow-lg transition-all cursor-pointer overflow-hidden ${
                                                    viewMode === 'grid' ? 'flex-col' : 'flex-row items-center justify-between p-3.5'
                                                }`}
                                            >
                                                {/* Thumbnail preview */}
                                                {viewMode === 'grid' ? (
                                                    <div className="relative aspect-[16/10] w-full bg-stone-950 flex items-center justify-center overflow-hidden border-b border-stone-100 dark:border-stone-800/60">
                                                        {canvas.thumbnail ? (
                                                            <img 
                                                                src={canvas.thumbnail} 
                                                                alt={canvas.name}
                                                                className="w-full h-full object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity"
                                                            />
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-1 text-stone-600 dark:text-stone-600">
                                                                <Flame size={24} className="opacity-40" />
                                                                <span className="text-[10px] font-mono opacity-60">Empty Canvas</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                                            <span className="text-white text-xs font-bold tracking-wide">Open whiteboard →</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <div className="w-12 h-9 rounded-lg bg-stone-950 overflow-hidden shrink-0 flex items-center justify-center border border-stone-200 dark:border-stone-800">
                                                            {canvas.thumbnail ? (
                                                                <img src={canvas.thumbnail} alt={canvas.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Flame size={14} className="text-stone-600" />
                                                            )}
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <h3 className="text-sm font-bold text-stone-900 dark:text-white truncate">
                                                                {canvas.name}
                                                            </h3>
                                                            <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                                                                <Clock size={11} />
                                                                <span>{formatTime(canvas.updated_at)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Card body (for grid view) */}
                                                {viewMode === 'grid' && (
                                                    <div className="p-3.5 flex items-center justify-between gap-2">
                                                        <div className="overflow-hidden flex-1">
                                                            {editingId === canvas.id ? (
                                                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                    <TextInput
                                                                        value={editingName}
                                                                        onChange={(e) => setEditingName(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') handleSaveRename(canvas.id, 'canvas');
                                                                            if (e.key === 'Escape') setEditingId(null);
                                                                        }}
                                                                        size="xs"
                                                                        autoFocus
                                                                        classNames={{ input: 'h-7 text-xs rounded-lg' }}
                                                                    />
                                                                    <button 
                                                                        onClick={() => handleSaveRename(canvas.id, 'canvas')}
                                                                        className="p-1 text-teal-600 hover:text-teal-700 cursor-pointer bg-transparent border-none"
                                                                    >
                                                                        <Check size={14} />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => setEditingId(null)}
                                                                        className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer bg-transparent border-none"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <h3 className="text-xs font-bold text-stone-900 dark:text-white truncate">
                                                                        {canvas.name}
                                                                    </h3>
                                                                    <div className="flex items-center gap-1 text-[10px] text-stone-400 mt-0.5">
                                                                        <Clock size={10} />
                                                                        <span>{formatTime(canvas.updated_at)}</span>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>

                                                        <Menu position="bottom-end" shadow="md">
                                                            <Menu.Target>
                                                                <button
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-none bg-transparent cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                                >
                                                                    <MoreVertical size={15} />
                                                                </button>
                                                            </Menu.Target>
                                                            <Menu.Dropdown className="bg-white dark:bg-[#18181c] border-stone-200 dark:border-stone-800 text-xs">
                                                                <Menu.Item
                                                                    leftSection={<Edit2 size={13} />}
                                                                    onClick={(e) => handleStartRename(canvas.id, 'canvas', canvas.name, e)}
                                                                >
                                                                    Rename
                                                                </Menu.Item>
                                                                <Menu.Item
                                                                    color="red"
                                                                    leftSection={<Trash2 size={13} />}
                                                                    onClick={(e) => handleDeleteCanvas(canvas, e)}
                                                                >
                                                                    Move to Trash
                                                                </Menu.Item>
                                                            </Menu.Dropdown>
                                                        </Menu>
                                                    </div>
                                                )}

                                                {/* Card actions (for list view) */}
                                                {viewMode === 'list' && (
                                                    <div className="flex items-center gap-1">
                                                        <Menu position="bottom-end" shadow="md">
                                                            <Menu.Target>
                                                                <button
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-none bg-transparent cursor-pointer"
                                                                >
                                                                    <MoreVertical size={16} />
                                                                </button>
                                                            </Menu.Target>
                                                            <Menu.Dropdown className="bg-white dark:bg-[#18181c] border-stone-200 dark:border-stone-800 text-xs">
                                                                <Menu.Item
                                                                    leftSection={<Edit2 size={13} />}
                                                                    onClick={(e) => handleStartRename(canvas.id, 'canvas', canvas.name, e)}
                                                                >
                                                                    Rename
                                                                </Menu.Item>
                                                                <Menu.Item
                                                                    color="red"
                                                                    leftSection={<Trash2 size={13} />}
                                                                    onClick={(e) => handleDeleteCanvas(canvas, e)}
                                                                >
                                                                    Move to Trash
                                                                </Menu.Item>
                                                            </Menu.Dropdown>
                                                        </Menu>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )
                ) : (
                    /* Trash View */
                    loadingTrash ? (
                        <div className="flex h-64 w-full items-center justify-center">
                            <Loader color="red" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center gap-2">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>Items in trash can be restored at any time or permanently deleted.</span>
                            </div>

                            {trashData.folders.length === 0 && trashData.canvases.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-12 border border-dashed border-stone-300 dark:border-stone-800 rounded-3xl text-center">
                                    <Trash2 size={32} className="text-stone-400 dark:text-stone-600 mb-2" />
                                    <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-1">Trash is empty</h3>
                                    <p className="text-xs text-stone-500 dark:text-stone-400">No deleted folders or notebooks found.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {trashData.folders.map(folder => (
                                        <div
                                            key={folder.id}
                                            className="flex items-center justify-between p-4 rounded-2xl border border-stone-200 dark:border-stone-800/80 bg-white dark:bg-[#141416]"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-500">
                                                    <FolderIcon size={18} />
                                                </div>
                                                <div>
                                                    <span className="text-sm font-bold text-stone-900 dark:text-white">
                                                        {folder.name}
                                                    </span>
                                                    <span className="text-[11px] text-stone-400 block">
                                                        Deleted {formatTime(folder.deleted_at || undefined)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="xs"
                                                    variant="light"
                                                    color="teal"
                                                    leftSection={<RotateCcw size={13} />}
                                                    onClick={() => handleRestoreFolder(folder.id)}
                                                    className="rounded-xl font-bold cursor-pointer"
                                                >
                                                    Restore
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    color="red"
                                                    leftSection={<Trash2 size={13} />}
                                                    onClick={() => handlePermanentDeleteFolder(folder.id)}
                                                    className="rounded-xl font-bold cursor-pointer"
                                                >
                                                    Delete Forever
                                                </Button>
                                            </div>
                                        </div>
                                    ))}

                                    {trashData.canvases.map(canvas => (
                                        <div
                                            key={canvas.id}
                                            className="flex items-center justify-between p-4 rounded-2xl border border-stone-200 dark:border-stone-800/80 bg-white dark:bg-[#141416]"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-9 rounded-lg bg-stone-950 overflow-hidden shrink-0 flex items-center justify-center border border-stone-200 dark:border-stone-800">
                                                    {canvas.thumbnail ? (
                                                        <img src={canvas.thumbnail} alt={canvas.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Flame size={14} className="text-stone-600" />
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="text-sm font-bold text-stone-900 dark:text-white">
                                                        {canvas.name}
                                                    </span>
                                                    <span className="text-[11px] text-stone-400 block">
                                                        Deleted {formatTime(canvas.deleted_at || undefined)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="xs"
                                                    variant="light"
                                                    color="teal"
                                                    leftSection={<RotateCcw size={13} />}
                                                    onClick={() => handleRestoreCanvas(canvas.id)}
                                                    className="rounded-xl font-bold cursor-pointer"
                                                >
                                                    Restore
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    color="red"
                                                    leftSection={<Trash2 size={13} />}
                                                    onClick={() => handlePermanentDeleteCanvas(canvas.id)}
                                                    className="rounded-xl font-bold cursor-pointer"
                                                >
                                                    Delete Forever
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                )}
            </main>

            {/* Create Folder Modal */}
            <Modal
                opened={createFolderModalOpen}
                onClose={() => setCreateFolderModalOpen(false)}
                title="Create New Folder"
                centered
                size="sm"
                classNames={{
                    content: "bg-white dark:bg-[#18181c] text-stone-900 dark:text-white rounded-2xl p-2",
                    header: "border-b border-stone-100 dark:border-stone-800/60 pb-3",
                    title: "font-bold text-sm"
                }}
            >
                <form onSubmit={handleCreateFolder} className="flex flex-col gap-4 mt-2">
                    <TextInput
                        placeholder="Folder name (e.g. Calculus, Physics)"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        autoFocus
                        required
                        classNames={{
                            input: 'bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-800 rounded-xl h-10',
                        }}
                    />
                    <div className="flex justify-end gap-2">
                        <Button 
                            variant="subtle" 
                            onClick={() => setCreateFolderModalOpen(false)}
                            className="rounded-xl text-xs font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs border-none"
                        >
                            Create Folder
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Create Canvas Modal */}
            <Modal
                opened={createCanvasModalOpen}
                onClose={() => setCreateCanvasModalOpen(false)}
                title="Create New Notebook"
                centered
                size="sm"
                classNames={{
                    content: "bg-white dark:bg-[#18181c] text-stone-900 dark:text-white rounded-2xl p-2",
                    header: "border-b border-stone-100 dark:border-stone-800/60 pb-3",
                    title: "font-bold text-sm"
                }}
            >
                <form onSubmit={handleCreateCanvas} className="flex flex-col gap-4 mt-2">
                    <TextInput
                        placeholder="Notebook name (e.g. Homework #3, Integral Calculus)"
                        value={newCanvasName}
                        onChange={(e) => setNewCanvasName(e.target.value)}
                        autoFocus
                        classNames={{
                            input: 'bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-800 rounded-xl h-10',
                        }}
                    />
                    <div className="flex justify-end gap-2">
                        <Button 
                            variant="subtle" 
                            onClick={() => setCreateCanvasModalOpen(false)}
                            className="rounded-xl text-xs font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs border-none"
                        >
                            Create & Open
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
