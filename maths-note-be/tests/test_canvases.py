import os
import sys

# Configure test environment
os.environ["APP_SECRET"] = "test-secret"
os.environ["ENV"] = "dev"
os.environ["DATABASE_URL"] = ""

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

import pytest
from fastapi.testclient import TestClient

from auth import get_current_user
from db import init_db
from main import app

# Override get_current_user for testing
current_test_user = "test-user-1"


def override_get_current_user():
    return current_test_user


app.dependency_overrides[get_current_user] = override_get_current_user

client = TestClient(app)
AUTH_HEADERS = {"X-App-Key": "test-secret", "Authorization": "Bearer test-token"}


@pytest.fixture(autouse=True)
def setup_database():
    init_db()
    yield


def test_folder_crud_and_isolation():
    global current_test_user
    current_test_user = "user-alice"

    # 1. Create Folder
    res = client.post("/folders", json={"name": "Algebra Notes"}, headers=AUTH_HEADERS)
    assert res.status_code == 200
    folder_data = res.json()
    assert folder_data["name"] == "Algebra Notes"
    assert folder_data["user_id"] == "user-alice"
    folder_id = folder_data["id"]

    # 2. List Folders
    res = client.get("/folders", headers=AUTH_HEADERS)
    assert res.status_code == 200
    folders = res.json()
    assert len(folders) >= 1
    assert any(f["id"] == folder_id and f["name"] == "Algebra Notes" for f in folders)

    # 3. Rename Folder
    res = client.patch(f"/folders/{folder_id}", json={"name": "Advanced Algebra"}, headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert res.json()["name"] == "Advanced Algebra"

    # 4. User Isolation: Another user (Bob) cannot see or rename Alice's folder
    current_test_user = "user-bob"
    res = client.get("/folders", headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert all(f["id"] != folder_id for f in res.json())

    res = client.patch(f"/folders/{folder_id}", json={"name": "Hacked"}, headers=AUTH_HEADERS)
    assert res.status_code == 404

    res = client.delete(f"/folders/{folder_id}", headers=AUTH_HEADERS)
    assert res.status_code == 404

    # 5. Switch back to Alice and delete folder
    current_test_user = "user-alice"
    res = client.delete(f"/folders/{folder_id}", headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # Verify folder is no longer listed (soft deleted)
    res = client.get("/folders", headers=AUTH_HEADERS)
    assert all(f["id"] != folder_id for f in res.json())


def test_canvas_crud_and_metadata_lightweight():
    global current_test_user
    current_test_user = "user-charlie"

    # 1. Create Folder
    f_res = client.post("/folders", json={"name": "Calculus"}, headers=AUTH_HEADERS)
    assert f_res.status_code == 200
    folder_id = f_res.json()["id"]

    # 2. Create Canvas inside Folder with heavy element content
    heavy_elements = [{"id": f"stroke-{i}", "points": [{"x": i, "y": i * 2}]} for i in range(100)]
    c_res = client.post(
        "/canvases",
        json={
            "name": "Derivatives Lecture 1",
            "folder_id": folder_id,
            "thumbnail": "data:image/png;base64,mockthumb",
            "elements": heavy_elements,
        },
        headers=AUTH_HEADERS,
    )
    assert c_res.status_code == 200
    canvas_data = c_res.json()
    canvas_id = canvas_data["id"]
    assert canvas_data["name"] == "Derivatives Lecture 1"
    assert canvas_data["folder_id"] == folder_id
    assert canvas_data["elements"] == heavy_elements

    # 3. GET /canvases (List Metadata Only) - Must NEVER return `elements`
    list_res = client.get("/canvases", headers=AUTH_HEADERS)
    assert list_res.status_code == 200
    metadata_list = list_res.json()
    assert len(metadata_list) >= 1
    target = next((c for c in metadata_list if c["id"] == canvas_id), None)
    assert target is not None
    assert target["name"] == "Derivatives Lecture 1"
    assert target["thumbnail"] == "data:image/png;base64,mockthumb"
    assert "elements" not in target  # Critical acceptance criterion: lightweight metadata only!

    # 4. GET /canvases/{id} - Must return full content including elements
    detail_res = client.get(f"/canvases/{canvas_id}", headers=AUTH_HEADERS)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == canvas_id
    assert detail["elements"] == heavy_elements

    # 5. PATCH /canvases/{id} (Rename & Update thumbnail)
    patch_res = client.patch(
        f"/canvases/{canvas_id}",
        json={"name": "Derivatives & Integrals", "thumbnail": "data:image/png;base64,newthumb"},
        headers=AUTH_HEADERS,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Derivatives & Integrals"
    assert patch_res.json()["thumbnail"] == "data:image/png;base64,newthumb"

    # 6. DELETE /canvases/{id} (Soft Delete)
    del_res = client.delete(f"/canvases/{canvas_id}", headers=AUTH_HEADERS)
    assert del_res.status_code == 200

    # Verify it is no longer listed or accessible
    assert all(c["id"] != canvas_id for c in client.get("/canvases", headers=AUTH_HEADERS).json())
    assert client.get(f"/canvases/{canvas_id}", headers=AUTH_HEADERS).status_code == 404


def test_delete_folder_orphans_notebooks_to_root():
    global current_test_user
    current_test_user = "user-david"

    # 1. Create Folder
    f_res = client.post("/folders", json={"name": "Physics"}, headers=AUTH_HEADERS)
    folder_id = f_res.json()["id"]

    # 2. Create 2 Canvases inside that folder
    c1 = client.post(
        "/canvases", json={"name": "Kinematics", "folder_id": folder_id, "elements": [{"id": 1}]}, headers=AUTH_HEADERS
    ).json()
    c2 = client.post(
        "/canvases",
        json={"name": "Thermodynamics", "folder_id": folder_id, "elements": [{"id": 2}]},
        headers=AUTH_HEADERS,
    ).json()

    assert c1["folder_id"] == folder_id
    assert c2["folder_id"] == folder_id

    # 3. Delete the folder
    del_f_res = client.delete(f"/folders/{folder_id}", headers=AUTH_HEADERS)
    assert del_f_res.status_code == 200

    # 4. Folder is soft-deleted
    assert all(f["id"] != folder_id for f in client.get("/folders", headers=AUTH_HEADERS).json())

    # 5. Canvases still exist and their folder_id is now NULL (orphaned to root), elements preserved!
    detail_c1 = client.get(f"/canvases/{c1['id']}", headers=AUTH_HEADERS).json()
    detail_c2 = client.get(f"/canvases/{c2['id']}", headers=AUTH_HEADERS).json()

    assert detail_c1["folder_id"] is None
    assert detail_c1["elements"] == [{"id": 1}]
    assert detail_c2["folder_id"] is None
    assert detail_c2["elements"] == [{"id": 2}]


def test_security_auth_and_invalid_folder():
    global current_test_user
    current_test_user = "user-eve"

    # Bad App Key
    bad_headers = {"X-App-Key": "wrong-secret", "Authorization": "Bearer token"}
    assert client.post("/folders", json={"name": "Test"}, headers=bad_headers).status_code == 401
    assert client.get("/folders", headers=bad_headers).status_code == 401
    assert client.post("/canvases", json={"name": "Test"}, headers=bad_headers).status_code == 401
    assert client.get("/canvases", headers=bad_headers).status_code == 401

    # Attempt to assign canvas to non-existent folder
    invalid_res = client.post(
        "/canvases", json={"name": "Test", "folder_id": "00000000-0000-0000-0000-000000000000"}, headers=AUTH_HEADERS
    )
    assert invalid_res.status_code == 404


def test_trash_and_restore_flow():
    global current_test_user
    current_test_user = "user-frank"

    # 1. Create Folder and Canvas
    f_res = client.post("/folders", json={"name": "Trash Test Folder"}, headers=AUTH_HEADERS)
    folder_id = f_res.json()["id"]

    c_res = client.post(
        "/canvases", json={"name": "Trash Test Canvas", "folder_id": folder_id, "elements": []}, headers=AUTH_HEADERS
    )
    canvas_id = c_res.json()["id"]

    # 2. Delete both
    assert client.delete(f"/canvases/{canvas_id}", headers=AUTH_HEADERS).status_code == 200
    assert client.delete(f"/folders/{folder_id}", headers=AUTH_HEADERS).status_code == 200

    # 3. Check Trash listing
    trash_res = client.get("/canvases/trash", headers=AUTH_HEADERS)
    assert trash_res.status_code == 200
    trash_data = trash_res.json()
    assert any(c["id"] == canvas_id for c in trash_data["canvases"])
    assert any(f["id"] == folder_id for f in trash_data["folders"])

    # 4. Restore Canvas
    restore_c = client.post(f"/canvases/{canvas_id}/restore", headers=AUTH_HEADERS)
    assert restore_c.status_code == 200
    assert client.get(f"/canvases/{canvas_id}", headers=AUTH_HEADERS).status_code == 200

    # 5. Restore Folder
    restore_f = client.post(f"/folders/{folder_id}/restore", headers=AUTH_HEADERS)
    assert restore_f.status_code == 200
    assert any(f["id"] == folder_id for f in client.get("/folders", headers=AUTH_HEADERS).json())

    # 6. Delete again and permanently purge
    client.delete(f"/canvases/{canvas_id}", headers=AUTH_HEADERS)
    client.delete(f"/folders/{folder_id}", headers=AUTH_HEADERS)

    perm_c = client.delete(f"/canvases/{canvas_id}/permanent", headers=AUTH_HEADERS)
    assert perm_c.status_code == 200
    perm_f = client.delete(f"/folders/{folder_id}/permanent", headers=AUTH_HEADERS)
    assert perm_f.status_code == 200

    # Verify not even in trash
    empty_trash = client.get("/canvases/trash", headers=AUTH_HEADERS).json()
    assert all(c["id"] != canvas_id for c in empty_trash["canvases"])
    assert all(f["id"] != folder_id for f in empty_trash["folders"])

