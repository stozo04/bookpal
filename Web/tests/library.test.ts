import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  completeUpload,
  createFolder,
  deleteFile,
  deleteFolder,
  saveReadingPlace,
  startUpload,
  updateFile,
  updateFolder,
  placeTime,
  type UploadRequest,
} from "../src/lib/library.ts";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Call = { table: string; steps: [string, ...unknown[]][] };

// A stand-in for the Supabase client: each query on a table resolves to the next
// scripted reply for that table, and every chained call is recorded.
function fakeDb(tables: Record<string, Reply[]>, storage: Record<string, Reply> = {}) {
  const calls: Call[] = [];
  const storageCalls: [string, ...unknown[]][] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        then(resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) {
          const reply = tables[table]?.shift();
          if (!reply) return Promise.reject(new Error(`no scripted reply for ${table}`)).then(resolve, reject);
          return Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null }).then(resolve, reject);
        },
      };
      for (const method of ["select", "insert", "update", "delete", "upsert", "eq", "single", "maybeSingle"]) {
        builder[method] = (...args: unknown[]) => (call.steps.push([method, ...args]), builder);
      }
      return builder;
    },
    storage: {
      from(bucket: string) {
        const method = (name: string) => async (...args: unknown[]) => {
          storageCalls.push([name, bucket, ...args]);
          const reply = storage[name] ?? {};
          return { data: reply.data ?? null, error: reply.error ?? null };
        };
        return { createSignedUploadUrl: method("createSignedUploadUrl"), info: method("info"), remove: method("remove") };
      },
    },
  };
  return { db: db as unknown as SupabaseClient, calls, storageCalls };
}

const quietly = async <T>(work: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await work();
  } finally {
    console.error = original;
  }
};

const USER = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const FOLDER = "33333333-3333-4333-8333-333333333333";

test("createFolder inserts for the user and maps a duplicate name to folder_already_exists", async () => {
  const folder = { id: FOLDER, parent_id: null, name: "Sci-fi" };
  const { db, calls } = fakeDb({ folders: [{ data: folder }, { error: { code: "23505" } }] });
  assert.deepEqual(await createFolder(db, USER, { name: "Sci-fi" }), { ok: true, value: folder });
  assert.deepEqual(calls[0].steps[0], ["insert", { name: "Sci-fi", parent_id: null, user_id: USER }]);
  assert.deepEqual(await createFolder(db, USER, { name: "Sci-fi" }), { ok: false, code: "folder_already_exists" });
});

test("updateFolder maps each database error and a missing row", async () => {
  const { db, calls } = fakeDb({
    folders: [{ error: { code: "23505" } }, { error: { code: "P0001" } }, { data: null }, { error: { code: "XX000" } }, { data: { id: FOLDER } }],
  });
  assert.deepEqual(await updateFolder(db, FOLDER, { name: "A" }), { ok: false, code: "folder_already_exists" });
  assert.deepEqual(await updateFolder(db, FOLDER, { parentId: FOLDER }), { ok: false, code: "folder_cycle" });
  assert.deepEqual(await updateFolder(db, FOLDER, { name: "A" }), { ok: false, code: "folder_not_found" });
  assert.deepEqual(await quietly(() => updateFolder(db, FOLDER, { name: "A" })), { ok: false, code: "failed" });
  assert.equal((await updateFolder(db, FOLDER, { parentId: null })).ok, true);
  assert.deepEqual(calls[1].steps.slice(0, 2), [["update", { parent_id: FOLDER }], ["eq", "id", FOLDER]]);
  assert.deepEqual(calls[4].steps[0], ["update", { parent_id: null }]);
});

test("deleteFolder refuses a folder with contents and reports a missing one", async () => {
  const { db } = fakeDb({ folders: [{ error: { code: "23503" } }, { data: null }, { data: { id: FOLDER } }] });
  assert.deepEqual(await deleteFolder(db, FOLDER), { ok: false, code: "folder_not_empty" });
  assert.deepEqual(await deleteFolder(db, FOLDER), { ok: false, code: "folder_not_found" });
  assert.deepEqual(await deleteFolder(db, FOLDER), { ok: true, value: null });
});

const upload: UploadRequest = {
  clientFileId: FILE,
  displayName: "Frankenstein",
  originalFilename: "frankenstein.epub",
  mediaType: "application/epub+zip",
  byteSize: 1234,
  sha256: "a".repeat(64),
  folderId: null,
};
const storedRow = { id: FILE, byte_size: 1234, media_type: "application/epub+zip", sha256: "a".repeat(64), storage_path: `${USER}/${FILE}/original` };
const signed = { path: `${USER}/${FILE}/original`, token: "t", signedUrl: "https://example.test/upload" };

test("startUpload creates the row at the user's storage path and signs an upsert URL", async () => {
  const { db, calls, storageCalls } = fakeDb(
    { library_files: [{ data: null }, { data: { ...storedRow, status: "pending" } }] },
    { createSignedUploadUrl: { data: signed } },
  );
  const started = await startUpload(db, USER, upload);
  assert.ok(started.ok);
  assert.equal(started.value.needsUpload, true);
  assert.deepEqual(started.value.upload, { bucket: "reader-files", ...signed });
  assert.equal("storage_path" in started.value.file, false);
  const inserted = calls[1].steps[0][1] as Record<string, unknown>;
  assert.equal(inserted.storage_path, `${USER}/${FILE}/original`);
  assert.equal(inserted.user_id, USER);
  assert.deepEqual(storageCalls[0], ["createSignedUploadUrl", "reader-files", `${USER}/${FILE}/original`, { upsert: true }]);
});

test("startUpload is idempotent: a ready file needs no upload and a pending one is re-signed", async () => {
  const ready = fakeDb({ library_files: [{ data: { ...storedRow, status: "ready" } }] });
  const again = await startUpload(ready.db, USER, upload);
  assert.ok(again.ok);
  assert.equal(again.value.needsUpload, false);
  assert.equal(again.value.upload, null);
  assert.equal(ready.calls.length, 1, "no insert for a file that already exists");

  const pending = fakeDb({ library_files: [{ data: { ...storedRow, status: "pending" } }] }, { createSignedUploadUrl: { data: signed } });
  const resumed = await startUpload(pending.db, USER, upload);
  assert.ok(resumed.ok);
  assert.equal(resumed.value.needsUpload, true);
  assert.equal(pending.calls.length, 1);
});

test("startUpload refuses a clientFileId that belongs to different content", async () => {
  for (const changed of [{ byteSize: 99 }, { mediaType: "application/pdf" }, { sha256: "b".repeat(64) }]) {
    const { db } = fakeDb({ library_files: [{ data: { ...storedRow, status: "ready" } }] });
    assert.deepEqual(await startUpload(db, USER, { ...upload, ...changed }), { ok: false, code: "file_identity_conflict" });
  }
});

test("startUpload rolls back a row it created when signing fails, but never an existing one", async () => {
  const fresh = fakeDb(
    { library_files: [{ data: null }, { data: { ...storedRow, status: "pending" } }, { data: null }] },
    { createSignedUploadUrl: { error: { message: "storage down" } } },
  );
  assert.deepEqual(await quietly(() => startUpload(fresh.db, USER, upload)), { ok: false, code: "failed" });
  assert.deepEqual(fresh.calls[2].steps, [["delete"], ["eq", "id", FILE]]);

  const resumed = fakeDb(
    { library_files: [{ data: { ...storedRow, status: "pending" } }] },
    { createSignedUploadUrl: { error: { message: "storage down" } } },
  );
  await quietly(() => startUpload(resumed.db, USER, upload));
  assert.equal(resumed.calls.length, 1, "no delete for a row an earlier attempt made");
});

const pendingFile = { id: FILE, storage_path: `${USER}/${FILE}/original`, byte_size: 1234, media_type: "application/epub+zip", status: "pending" };

test("completeUpload marks the file ready only when the stored object matches", async () => {
  const { db, calls } = fakeDb(
    { library_files: [{ data: pendingFile }, { data: { id: FILE, status: "ready" } }] },
    { info: { data: { size: 1234, contentType: "application/epub+zip" } } },
  );
  assert.equal((await completeUpload(db, FILE)).ok, true);
  assert.deepEqual(calls[0].steps[1], ["eq", "id", FILE]);
  assert.deepEqual(calls[1].steps.slice(0, 2), [["update", { status: "ready" }], ["eq", "id", FILE]]);
});

test("completeUpload reports a missing file, a missing object and each mismatch", async () => {
  const missing = fakeDb({ library_files: [{ data: null }] });
  assert.deepEqual(await completeUpload(missing.db, FILE), { ok: false, code: "file_not_found" });

  const cases: [Reply, string][] = [
    [{ error: { message: "Object not found" } }, "upload_incomplete"],
    [{ data: { size: 1, contentType: "application/epub+zip" } }, "upload_size_mismatch"],
    [{ data: { size: 1234, contentType: "text/plain" } }, "upload_type_mismatch"],
  ];
  for (const [info, code] of cases) {
    const { db, calls } = fakeDb({ library_files: [{ data: pendingFile }] }, { info });
    assert.deepEqual(await completeUpload(db, FILE), { ok: false, code });
    assert.equal(calls.length, 1, "nothing is marked ready");
  }
});

test("completeUpload accepts an object whose size or type storage doesn't report", async () => {
  const { db } = fakeDb({ library_files: [{ data: pendingFile }, { data: { id: FILE } }] }, { info: { data: {} } });
  assert.equal((await completeUpload(db, FILE)).ok, true);
});

test("updateFile renames and moves, and reports a missing file", async () => {
  const { db, calls } = fakeDb({ library_files: [{ data: { id: FILE } }, { data: null }] });
  assert.equal((await updateFile(db, FILE, { displayName: "New", folderId: null })).ok, true);
  assert.deepEqual(calls[0].steps.slice(0, 2), [["update", { display_name: "New", folder_id: null }], ["eq", "id", FILE]]);
  assert.deepEqual(await updateFile(db, FILE, { folderId: FOLDER }), { ok: false, code: "file_not_found" });
});

test("deleteFile removes the stored object before the row", async () => {
  const { db, calls, storageCalls } = fakeDb({ library_files: [{ data: { id: FILE, storage_path: "p" } }, { data: null }] });
  assert.deepEqual(await deleteFile(db, FILE), { ok: true, value: null });
  assert.deepEqual(storageCalls, [["remove", "reader-files", ["p"]]]);
  assert.deepEqual(calls[1].steps, [["delete"], ["eq", "id", FILE]]);
});

test("deleteFile keeps the row when the stored object can't be removed", async () => {
  const { db, calls } = fakeDb({ library_files: [{ data: { id: FILE, storage_path: "p" } }] }, { remove: { error: { message: "nope" } } });
  assert.deepEqual(await quietly(() => deleteFile(db, FILE)), { ok: false, code: "failed" });
  assert.equal(calls.length, 1);
});

test("saveReadingPlace upserts one row per user and book, stamped with the given time", async () => {
  const { db, calls } = fakeDb({ library_files: [{ data: { id: FILE } }], reading_states: [{ data: null }] });
  const at = new Date("2026-11-23T12:00:00Z");
  const locator = { schemaVersion: 1, resourceID: "ch1" };
  const device = "44444444-4444-4444-8444-444444444444";
  assert.deepEqual(await saveReadingPlace(db, USER, { fileId: FILE, deviceId: device, progress: 0.25, locator, at }), { ok: true, value: null });
  assert.deepEqual(calls[0].steps[1], ["eq", "id", FILE]);
  assert.deepEqual(calls[1].steps[0], [
    "upsert",
    {
      user_id: USER,
      file_id: FILE,
      locator,
      progress: 0.25,
      last_opened_at: "2026-11-23T12:00:00.000Z",
      device_id: device,
      client_updated_at: "2026-11-23T12:00:00.000Z",
    },
    { onConflict: "user_id,file_id" },
  ]);
});

test("saveReadingPlace refuses a book the user doesn't own and reports a failed write", async () => {
  const notMine = fakeDb({ library_files: [{ data: null }] });
  const place = { fileId: FILE, deviceId: FILE, progress: 0, locator: {}, at: new Date() };
  assert.deepEqual(await saveReadingPlace(notMine.db, USER, place), { ok: false, code: "file_not_found" });
  assert.equal(notMine.calls.length, 1);

  const broken = fakeDb({ library_files: [{ data: { id: FILE } }], reading_states: [{ error: { message: "down" } }] });
  assert.deepEqual(await quietly(() => saveReadingPlace(broken.db, USER, place)), { ok: false, code: "failed" });
});

test("deleteFile reports a row that couldn't be deleted after the stored book was removed", async () => {
  const { db, storageCalls } = fakeDb({ library_files: [{ data: { id: FILE, storage_path: "p" } }, { error: { message: "down" } }] });
  assert.deepEqual(await quietly(() => deleteFile(db, FILE)), { ok: false, code: "failed" });
  assert.equal(storageCalls.length, 1);
});

test("startUpload fails cleanly when the lookup or the insert fails", async () => {
  const lookup = fakeDb({ library_files: [{ error: { message: "down" } }] });
  assert.deepEqual(await quietly(() => startUpload(lookup.db, USER, upload)), { ok: false, code: "failed" });
  assert.equal(lookup.calls.length, 1);

  const insert = fakeDb({ library_files: [{ data: null }, { error: { code: "23505" } }] });
  assert.deepEqual(await quietly(() => startUpload(insert.db, USER, upload)), { ok: false, code: "failed" });
  assert.equal(insert.calls.length, 2, "nothing to sign or roll back");
});

test("completeUpload reports a failed update", async () => {
  const { db } = fakeDb(
    { library_files: [{ data: pendingFile }, { error: { message: "down" } }] },
    { info: { data: { size: 1234, contentType: "application/epub+zip" } } },
  );
  assert.deepEqual(await quietly(() => completeUpload(db, FILE)), { ok: false, code: "failed" });
});

test("folder writes report unexpected errors as failed", async () => {
  const { db } = fakeDb({ folders: [{ error: { code: "XX000" } }, { error: { code: "XX000" } }] });
  assert.deepEqual(await quietly(() => createFolder(db, USER, { name: "A" })), { ok: false, code: "failed" });
  assert.deepEqual(await quietly(() => deleteFolder(db, FOLDER)), { ok: false, code: "failed" });
});

test("placeTime uses the client's moment but never one ahead of the server", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");
  assert.equal(placeTime(now - 5000, now).getTime(), now - 5000);
  assert.equal(placeTime(now + 60_000, now).getTime(), now);
  assert.equal(placeTime(undefined, now).getTime(), now);
});
