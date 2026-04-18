/**
 * Service-layer tests for media-library.
 *
 * Hits the real Neon dev branch via `db`. Covers:
 *   - default folder lazy creation (idempotent)
 *   - folder create + sibling name uniqueness
 *   - folder delete rejects non-empty / default folders
 *   - asset upload happy path (mime + size validation)
 *   - asset delete removes DB row AND storage object
 *   - move-folder cycle detection
 *
 * Storage is swapped for an in-memory `FakeStorage` so tests don't
 * need R2 or network access.
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import type { ObjectStorage } from "../../lib/storage";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createMediaLibraryService } from "./service";

class FakeStorage implements ObjectStorage {
  private objects = new Map<string, Uint8Array>();

  async put(key: string, body: Uint8Array | ArrayBuffer | Blob | string) {
    let bytes: Uint8Array;
    if (typeof body === "string") bytes = new TextEncoder().encode(body);
    else if (body instanceof Uint8Array) bytes = body;
    else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
    else bytes = new Uint8Array(await body.arrayBuffer());
    this.objects.set(key, bytes);
    return { key, size: bytes.byteLength };
  }
  async get(key: string) {
    const b = this.objects.get(key);
    if (!b) return null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(b);
        controller.close();
      },
    });
    return { body: stream, size: b.byteLength };
  }
  async head(key: string) {
    const b = this.objects.get(key);
    return b ? { key, size: b.byteLength } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async list() {
    return { items: [], truncated: false };
  }
  getPublicUrl(key: string): string {
    return `https://fake.example.com/${key}`;
  }
  async getPresignedPutUrl(key: string) {
    return `https://fake.example.com/${key}?put-sig=x`;
  }
  async getPresignedGetUrl(key: string) {
    return `https://fake.example.com/${key}?get-sig=x`;
  }

  get size(): number {
    return this.objects.size;
  }
  has(key: string): boolean {
    return this.objects.has(key);
  }
}

describe("media-library service", () => {
  const storage = new FakeStorage();
  const svc = createMediaLibraryService({ db, storage });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("media-lib-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("ensureDefaultFolder is idempotent", async () => {
    const a = await svc.ensureDefaultFolder(orgId, null);
    const b = await svc.ensureDefaultFolder(orgId, null);
    expect(a.id).toBe(b.id);
    expect(a.isDefault).toBe(true);
    expect(a.parentId).toBeNull();
  });

  test("createFolder rejects duplicate sibling names", async () => {
    await svc.createFolder(orgId, { name: "banners" }, null);
    await expect(
      svc.createFolder(orgId, { name: "banners" }, null),
    ).rejects.toMatchObject({ code: "media_library.folder_name_conflict" });
  });

  test("createFolder under parent works, sibling uniqueness scoped to parent", async () => {
    const root = await svc.createFolder(orgId, { name: "campaigns" }, null);
    const childA = await svc.createFolder(
      orgId,
      { name: "spring", parentId: root.id },
      null,
    );
    // Same name under a different parent is fine
    const otherRoot = await svc.createFolder(
      orgId,
      { name: "campaigns-archive" },
      null,
    );
    const childB = await svc.createFolder(
      orgId,
      { name: "spring", parentId: otherRoot.id },
      null,
    );
    expect(childA.parentId).toBe(root.id);
    expect(childB.parentId).toBe(otherRoot.id);
  });

  test("cannot delete the default folder", async () => {
    const def = await svc.ensureDefaultFolder(orgId, null);
    await expect(svc.deleteFolder(orgId, def.id)).rejects.toMatchObject({
      code: "media_library.cannot_delete_default_folder",
    });
  });

  test("upload happy path lands in default folder when folderId omitted", async () => {
    const def = await svc.ensureDefaultFolder(orgId, null);
    const asset = await svc.uploadAsset({
      organizationId: orgId,
      folderId: null,
      filename: "cover.png",
      mimeType: "image/png",
      body: new Uint8Array([1, 2, 3, 4]),
      uploadedBy: null,
    });
    expect(asset.folderId).toBe(def.id);
    expect(asset.filename).toBe("cover.png");
    expect(asset.size).toBe(4);
    expect(storage.has(asset.objectKey)).toBe(true);
  });

  test("upload rejects disallowed mime type", async () => {
    await expect(
      svc.uploadAsset({
        organizationId: orgId,
        folderId: null,
        filename: "hack.exe",
        mimeType: "application/x-msdownload",
        body: new Uint8Array([1]),
        uploadedBy: null,
      }),
    ).rejects.toMatchObject({ code: "media_library.invalid_mime_type" });
  });

  test("upload rejects oversized file", async () => {
    await expect(
      svc.uploadAsset({
        organizationId: orgId,
        folderId: null,
        filename: "big.png",
        mimeType: "image/png",
        body: new Uint8Array(11 * 1024 * 1024),
        uploadedBy: null,
      }),
    ).rejects.toMatchObject({ code: "media_library.file_too_large" });
  });

  test("deleteAsset removes row AND storage object", async () => {
    const asset = await svc.uploadAsset({
      organizationId: orgId,
      folderId: null,
      filename: "tmp.png",
      mimeType: "image/png",
      body: new Uint8Array([9, 9, 9]),
      uploadedBy: null,
    });
    expect(storage.has(asset.objectKey)).toBe(true);
    await svc.deleteAsset(orgId, asset.id);
    expect(storage.has(asset.objectKey)).toBe(false);
    await expect(svc.getAsset(orgId, asset.id)).rejects.toMatchObject({
      code: "media_library.asset_not_found",
    });
  });

  test("deleteFolder refuses non-empty folders", async () => {
    const folder = await svc.createFolder(orgId, { name: "tmp-full" }, null);
    await svc.uploadAsset({
      organizationId: orgId,
      folderId: folder.id,
      filename: "a.png",
      mimeType: "image/png",
      body: new Uint8Array([1]),
      uploadedBy: null,
    });
    await expect(svc.deleteFolder(orgId, folder.id)).rejects.toMatchObject({
      code: "media_library.folder_not_empty",
    });
  });

  test("moving a folder into its own descendant is rejected", async () => {
    const a = await svc.createFolder(orgId, { name: "a-root" }, null);
    const b = await svc.createFolder(
      orgId,
      { name: "b", parentId: a.id },
      null,
    );
    await expect(
      svc.updateFolder(orgId, a.id, { parentId: b.id }),
    ).rejects.toMatchObject({ code: "media_library.folder_cycle" });
  });

  test("updateFolder rename collision rejected", async () => {
    const p = await svc.createFolder(orgId, { name: "collision-parent" }, null);
    await svc.createFolder(orgId, { name: "alpha", parentId: p.id }, null);
    const other = await svc.createFolder(
      orgId,
      { name: "beta", parentId: p.id },
      null,
    );
    await expect(
      svc.updateFolder(orgId, other.id, { name: "alpha" }),
    ).rejects.toMatchObject({ code: "media_library.folder_name_conflict" });
  });

  test("listFolders returns breadcrumb for nested folder", async () => {
    const l1 = await svc.createFolder(orgId, { name: "bc-l1" }, null);
    const l2 = await svc.createFolder(
      orgId,
      { name: "bc-l2", parentId: l1.id },
      null,
    );
    const { breadcrumb } = await svc.listFolders(orgId, l2.id);
    expect(breadcrumb.map((e) => e.name)).toEqual(["bc-l1", "bc-l2"]);
  });
});
