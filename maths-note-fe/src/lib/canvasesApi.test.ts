import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { 
    fetchFolders, 
    createFolder, 
    updateFolder, 
    deleteFolder, 
    restoreFolder, 
    permanentlyDeleteFolder,
    fetchCanvasesMetadata, 
    fetchCanvasDetail, 
    createCanvas, 
    updateCanvas, 
    deleteCanvas, 
    restoreCanvas, 
    permanentlyDeleteCanvas,
    fetchTrash, 
    getAuthHeaders 
} from './canvasesApi';

vi.mock('axios');

describe('canvasesApi', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getAuthHeaders', () => {
        it('should return headers with provided token', async () => {
            const headers = await getAuthHeaders('my-custom-token');
            expect(headers['Authorization']).toBe('Bearer my-custom-token');
            expect(headers['Content-Type']).toBe('application/json');
        });
    });

    describe('Folders API', () => {
        it('fetchFolders should return folder list when authenticated', async () => {
            const mockFolders = [{ id: 'f1', name: 'Calculus', user_id: 'u1' }];
            (axios.get as any).mockResolvedValueOnce({ data: mockFolders });

            const result = await fetchFolders('token-123');
            expect(result).toEqual(mockFolders);
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('/folders'),
                expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-123' }) })
            );
        });

        it('createFolder should send POST request', async () => {
            const created = { id: 'f2', name: 'Physics', user_id: 'u1' };
            (axios.post as any).mockResolvedValueOnce({ data: created });

            const result = await createFolder('Physics', 'token-123');
            expect(result).toEqual(created);
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/folders'),
                { name: 'Physics' },
                expect.any(Object)
            );
        });

        it('updateFolder should send PATCH request', async () => {
            const updated = { id: 'f1', name: 'Advanced Calculus', user_id: 'u1' };
            (axios.patch as any).mockResolvedValueOnce({ data: updated });

            const result = await updateFolder('f1', 'Advanced Calculus', 'token-123');
            expect(result).toEqual(updated);
        });

        it('deleteFolder should send DELETE request', async () => {
            (axios.delete as any).mockResolvedValueOnce({ data: { status: 'success' } });

            const result = await deleteFolder('f1', 'token-123');
            expect(result.status).toBe('success');
        });

        it('restoreFolder and permanentlyDeleteFolder should work', async () => {
            (axios.post as any).mockResolvedValueOnce({ data: { status: 'success' } });
            (axios.delete as any).mockResolvedValueOnce({ data: { status: 'success' } });

            const res1 = await restoreFolder('f1', 'token-123');
            const res2 = await permanentlyDeleteFolder('f1', 'token-123');

            expect(res1.status).toBe('success');
            expect(res2.status).toBe('success');
        });
    });

    describe('Canvases API', () => {
        it('fetchCanvasesMetadata should fetch scoped or all metadata', async () => {
            const mockCanvases = [{ id: 'c1', name: 'Lecture 1', thumbnail: 'thumb' }];
            (axios.get as any).mockResolvedValueOnce({ data: mockCanvases });

            const result = await fetchCanvasesMetadata('folder-99', 'token-123');
            expect(result).toEqual(mockCanvases);
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('/canvases?folder_id=folder-99'),
                expect.any(Object)
            );
        });

        it('fetchCanvasDetail should return full canvas', async () => {
            const detail = { id: 'c1', name: 'Lecture 1', elements: [{ id: 1 }] };
            (axios.get as any).mockResolvedValueOnce({ data: detail });

            const result = await fetchCanvasDetail('c1', 'token-123');
            expect(result).toEqual(detail);
        });

        it('createCanvas and updateCanvas should send correct payloads', async () => {
            const created = { id: 'c2', name: 'New Canvas', elements: [] };
            (axios.post as any).mockResolvedValueOnce({ data: created });
            (axios.patch as any).mockResolvedValueOnce({ data: { ...created, name: 'Renamed' } });

            const resCreate = await createCanvas({ name: 'New Canvas' }, 'token-123');
            const resUpdate = await updateCanvas('c2', { name: 'Renamed' }, 'token-123');

            expect(resCreate.name).toBe('New Canvas');
            expect(resUpdate.name).toBe('Renamed');
        });

        it('deleteCanvas, restoreCanvas, and permanentlyDeleteCanvas should work', async () => {
            (axios.delete as any).mockResolvedValueOnce({ data: { status: 'success' } });
            (axios.post as any).mockResolvedValueOnce({ data: { status: 'success' } });
            (axios.delete as any).mockResolvedValueOnce({ data: { status: 'success' } });

            const resDel = await deleteCanvas('c1', 'token-123');
            const resRest = await restoreCanvas('c1', 'token-123');
            const resPerm = await permanentlyDeleteCanvas('c1', 'token-123');

            expect(resDel.status).toBe('success');
            expect(resRest.status).toBe('success');
            expect(resPerm.status).toBe('success');
        });
    });

    describe('Trash API', () => {
        it('fetchTrash should return soft-deleted folders and canvases', async () => {
            const mockTrash = {
                folders: [{ id: 'f_del', name: 'Old Folder', user_id: 'u1' }],
                canvases: [{ id: 'c_del', name: 'Old Notebook' }]
            };
            (axios.get as any).mockResolvedValueOnce({ data: mockTrash });

            const result = await fetchTrash('token-123');
            expect(result).toEqual(mockTrash);
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('/canvases/trash'),
                expect.any(Object)
            );
        });
    });
});
