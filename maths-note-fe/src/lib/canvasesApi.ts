import axios from 'axios';
import { supabase } from './supabase';

export interface Folder {
    id: string;
    user_id: string;
    name: string;
    created_at?: string;
    updated_at?: string;
    deleted_at?: string | null;
}

export interface CanvasMetadata {
    id: string;
    user_id?: string;
    folder_id?: string | null;
    name: string;
    thumbnail?: string | null;
    created_at?: string;
    updated_at?: string;
    deleted_at?: string | null;
}

export interface CanvasDetail extends CanvasMetadata {
    elements?: any[];
}

export interface TrashData {
    folders: Folder[];
    canvases: CanvasMetadata[];
}

const getApiHost = () => import.meta.env.VITE_API_URL || 'http://localhost:5001';
const getAppSecret = () => import.meta.env.VITE_APP_KEY || import.meta.env.VITE_APP_SECRET || '';

export async function getAuthHeaders(providedToken?: string | null): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    const appSecret = getAppSecret();
    if (appSecret) {
        headers['X-App-Key'] = appSecret;
    }

    if (providedToken) {
        headers['Authorization'] = `Bearer ${providedToken}`;
        return headers;
    }

    if (supabase) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    return headers;
}

// ---------------- FOLDERS ----------------

export async function fetchFolders(token?: string | null): Promise<Folder[]> {
    const headers = await getAuthHeaders(token);
    if (!headers['Authorization']) return [];
    const res = await axios.get(`${getApiHost()}/folders`, { headers });
    return res.data || [];
}

export async function createFolder(name: string, token?: string | null): Promise<Folder> {
    const headers = await getAuthHeaders(token);
    const res = await axios.post(`${getApiHost()}/folders`, { name }, { headers });
    return res.data;
}

export async function updateFolder(folderId: string, name: string, token?: string | null): Promise<Folder> {
    const headers = await getAuthHeaders(token);
    const res = await axios.patch(`${getApiHost()}/folders/${folderId}`, { name }, { headers });
    return res.data;
}

export async function deleteFolder(folderId: string, token?: string | null): Promise<{ status: string }> {
    const headers = await getAuthHeaders(token);
    const res = await axios.delete(`${getApiHost()}/folders/${folderId}`, { headers });
    return res.data;
}

export async function restoreFolder(folderId: string, token?: string | null): Promise<{ status: string }> {
    const headers = await getAuthHeaders(token);
    const res = await axios.post(`${getApiHost()}/folders/${folderId}/restore`, {}, { headers });
    return res.data;
}

export async function permanentlyDeleteFolder(folderId: string, token?: string | null): Promise<{ status: string }> {
    const headers = await getAuthHeaders(token);
    const res = await axios.delete(`${getApiHost()}/folders/${folderId}/permanent`, { headers });
    return res.data;
}

// ---------------- CANVASES ----------------

export async function fetchCanvasesMetadata(folderId?: string | null, token?: string | null): Promise<CanvasMetadata[]> {
    const headers = await getAuthHeaders(token);
    if (!headers['Authorization']) return [];
    const url = folderId
        ? `${getApiHost()}/canvases?folder_id=${encodeURIComponent(folderId)}`
        : `${getApiHost()}/canvases`;
    const res = await axios.get(url, { headers });
    return res.data || [];
}

export async function fetchCanvasDetail(canvasId: string, token?: string | null): Promise<CanvasDetail | null> {
    const headers = await getAuthHeaders(token);
    if (!headers['Authorization']) return null;
    const res = await axios.get(`${getApiHost()}/canvases/${canvasId}`, { headers });
    return res.data;
}

export async function createCanvas(
    payload: { name: string; folder_id?: string | null; thumbnail?: string | null; elements?: any[] },
    token?: string | null
): Promise<CanvasDetail> {
    const headers = await getAuthHeaders(token);
    const res = await axios.post(`${getApiHost()}/canvases`, payload, { headers });
    return res.data;
}

export async function updateCanvas(
    canvasId: string,
    payload: { name?: string; folder_id?: string | null; thumbnail?: string | null; elements?: any[] },
    token?: string | null
): Promise<CanvasDetail> {
    const headers = await getAuthHeaders(token);
    const res = await axios.patch(`${getApiHost()}/canvases/${canvasId}`, payload, { headers });
    return res.data;
}

export async function deleteCanvas(canvasId: string, token?: string | null): Promise<{ status: string }> {
    const headers = await getAuthHeaders(token);
    const res = await axios.delete(`${getApiHost()}/canvases/${canvasId}`, { headers });
    return res.data;
}

export async function restoreCanvas(canvasId: string, token?: string | null): Promise<{ status: string }> {
    const headers = await getAuthHeaders(token);
    const res = await axios.post(`${getApiHost()}/canvases/${canvasId}/restore`, {}, { headers });
    return res.data;
}

export async function permanentlyDeleteCanvas(canvasId: string, token?: string | null): Promise<{ status: string }> {
    const headers = await getAuthHeaders(token);
    const res = await axios.delete(`${getApiHost()}/canvases/${canvasId}/permanent`, { headers });
    return res.data;
}

// ---------------- TRASH ----------------

export async function fetchTrash(token?: string | null): Promise<TrashData> {
    const headers = await getAuthHeaders(token);
    if (!headers['Authorization']) return { folders: [], canvases: [] };
    const res = await axios.get(`${getApiHost()}/canvases/trash`, { headers });
    return res.data || { folders: [], canvases: [] };
}
