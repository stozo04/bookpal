import type { SupabaseClient } from "@supabase/supabase-js";

// Library writes made with the signed-in user's own Supabase client, so row-level
// security and the storage owner policies limit every query to their rows.

export const FILES_BUCKET = "reader-files";
const FOLDER_COLUMNS = "id,parent_id,name,created_at,updated_at";
const FILE_COLUMNS = "id,folder_id,display_name,original_filename,media_type,byte_size,sha256,status,created_at,updated_at";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const RAISED_EXCEPTION = "P0001"; // the folders trigger raises this for a cycle

export type Outcome<T, Code extends string> = { ok: true; value: T } | { ok: false; code: Code | "failed" };

const succeed = <T>(value: T) => ({ ok: true, value }) as const;
const refuse = <Code extends string>(code: Code) => ({ ok: false, code }) as const;
function failed(operation: string, error: unknown) {
  console.error(`library: ${operation} failed`, error);
  return refuse("failed");
}

export type FolderRow = { id: string; parent_id: string | null; name: string; created_at: string; updated_at: string };
export type FileRow = {
  id: string;
  folder_id: string | null;
  display_name: string;
  original_filename: string;
  media_type: string;
  byte_size: number;
  sha256: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function storagePathFor(userId: string, fileId: string) {
  return `${userId}/${fileId}/original`;
}

export async function createFolder(
  db: SupabaseClient,
  userId: string,
  input: { name: string; parentId?: string | null },
): Promise<Outcome<FolderRow, "folder_already_exists">> {
  const { data, error } = await db
    .from("folders")
    .insert({ name: input.name, parent_id: input.parentId ?? null, user_id: userId })
    .select(FOLDER_COLUMNS)
    .single();
  if (error?.code === UNIQUE_VIOLATION) return refuse("folder_already_exists");
  if (error) return failed("create folder", error);
  return succeed(data as FolderRow);
}

export async function updateFolder(
  db: SupabaseClient,
  folderId: string,
  input: { name?: string; parentId?: string | null },
): Promise<Outcome<FolderRow, "folder_already_exists" | "folder_cycle" | "folder_not_found">> {
  const updates: Record<string, string | null> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.parentId !== undefined) updates.parent_id = input.parentId;

  const { data, error } = await db.from("folders").update(updates).eq("id", folderId).select(FOLDER_COLUMNS).maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) return refuse("folder_already_exists");
  if (error?.code === RAISED_EXCEPTION) return refuse("folder_cycle");
  if (error) return failed("update folder", error);
  if (!data) return refuse("folder_not_found");
  return succeed(data as FolderRow);
}

export async function deleteFolder(
  db: SupabaseClient,
  folderId: string,
): Promise<Outcome<null, "folder_not_empty" | "folder_not_found">> {
  const { data, error } = await db.from("folders").delete().eq("id", folderId).select("id").maybeSingle();
  if (error?.code === FOREIGN_KEY_VIOLATION) return refuse("folder_not_empty");
  if (error) return failed("delete folder", error);
  if (!data) return refuse("folder_not_found");
  return succeed(null);
}

export type UploadRequest = {
  clientFileId: string;
  displayName: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  folderId?: string | null;
};

export type SignedUpload = { bucket: string; path: string; token: string; signedUrl: string };
export type StartedUpload = { file: FileRow; needsUpload: boolean; upload: SignedUpload | null };

// Idempotent on clientFileId: a retry resumes the same row, and a ready file
// needs no second upload.
export async function startUpload(
  db: SupabaseClient,
  userId: string,
  input: UploadRequest,
): Promise<Outcome<StartedUpload, "file_identity_conflict">> {
  const fileId = input.clientFileId;
  const { data: existing, error: lookupError } = await db
    .from("library_files")
    .select(`${FILE_COLUMNS},storage_path`)
    .eq("id", fileId)
    .maybeSingle();
  if (lookupError) return failed("look up upload", lookupError);

  if (existing && !sameContent(existing, input)) return refuse("file_identity_conflict");
  if (existing?.status === "ready") return succeed({ file: withoutStoragePath(existing), needsUpload: false, upload: null });

  let file = existing;
  if (!file) {
    const { data, error } = await db
      .from("library_files")
      .insert({
        id: fileId,
        user_id: userId,
        folder_id: input.folderId ?? null,
        display_name: input.displayName,
        original_filename: input.originalFilename,
        media_type: input.mediaType,
        byte_size: input.byteSize,
        sha256: input.sha256,
        storage_path: storagePathFor(userId, fileId),
      })
      .select(`${FILE_COLUMNS},storage_path`)
      .single();
    if (error) return failed("create upload", error);
    file = data;
  }

  const { data: upload, error: signError } = await db.storage
    .from(FILES_BUCKET)
    .createSignedUploadUrl(file.storage_path, { upsert: true });
  if (signError || !upload) {
    if (!existing) await db.from("library_files").delete().eq("id", fileId);
    return failed("sign upload", signError);
  }

  return succeed({
    file: withoutStoragePath(file),
    needsUpload: true,
    upload: { bucket: FILES_BUCKET, path: upload.path, token: upload.token, signedUrl: upload.signedUrl },
  });
}

function sameContent(row: { byte_size: number; media_type: string; sha256: string | null }, input: UploadRequest) {
  return row.byte_size === input.byteSize && row.media_type === input.mediaType && row.sha256 === input.sha256;
}

function withoutStoragePath({ storage_path: _, ...file }: FileRow & { storage_path: string }): FileRow {
  return file;
}

export async function completeUpload(
  db: SupabaseClient,
  fileId: string,
): Promise<Outcome<FileRow, "file_not_found" | "upload_incomplete" | "upload_size_mismatch" | "upload_type_mismatch">> {
  const { data: file, error: lookupError } = await db
    .from("library_files")
    .select("id,storage_path,byte_size,media_type,status")
    .eq("id", fileId)
    .maybeSingle();
  if (lookupError) return failed("look up upload", lookupError);
  if (!file) return refuse("file_not_found");

  const { data: object, error: objectError } = await db.storage.from(FILES_BUCKET).info(file.storage_path);
  if (objectError || !object) return refuse("upload_incomplete");
  if (object.size !== undefined && object.size !== file.byte_size) return refuse("upload_size_mismatch");
  if (object.contentType !== undefined && object.contentType !== file.media_type) return refuse("upload_type_mismatch");

  const { data, error } = await db.from("library_files").update({ status: "ready" }).eq("id", file.id).select(FILE_COLUMNS).single();
  if (error) return failed("finish upload", error);
  return succeed(data as FileRow);
}

export async function updateFile(
  db: SupabaseClient,
  fileId: string,
  input: { displayName?: string; folderId?: string | null },
): Promise<Outcome<FileRow, "file_not_found">> {
  const updates: Record<string, string | null> = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName;
  if (input.folderId !== undefined) updates.folder_id = input.folderId;

  const { data, error } = await db.from("library_files").update(updates).eq("id", fileId).select(FILE_COLUMNS).maybeSingle();
  if (error) return failed("update file", error);
  if (!data) return refuse("file_not_found");
  return succeed(data as FileRow);
}

// Same order as the old backend: the stored book goes first, so a failure can
// leave a row whose file is missing but never an object nobody can find.
export async function deleteFile(db: SupabaseClient, fileId: string): Promise<Outcome<null, "file_not_found">> {
  const { data: file, error: lookupError } = await db.from("library_files").select("id,storage_path").eq("id", fileId).maybeSingle();
  if (lookupError) return failed("look up file", lookupError);
  if (!file) return refuse("file_not_found");

  const { error: storageError } = await db.storage.from(FILES_BUCKET).remove([file.storage_path]);
  if (storageError) return failed("remove stored file", storageError);

  const { error } = await db.from("library_files").delete().eq("id", file.id);
  if (error) return failed("delete file", error);
  return succeed(null);
}

// A clock running ahead must not pin the row: every later save would be dropped as older.
export function placeTime(clientUpdatedAt: number | undefined, now: number): Date {
  return new Date(Math.min(clientUpdatedAt ?? now, now));
}

export type ReadingPlace = { fileId: string; deviceId: string; progress: number; locator: unknown; at: Date };

// The reading_states_keep_newest trigger drops a write older than the stored one.
export async function saveReadingPlace(
  db: SupabaseClient,
  userId: string,
  place: ReadingPlace,
): Promise<Outcome<null, "file_not_found">> {
  const { data: file, error: lookupError } = await db.from("library_files").select("id").eq("id", place.fileId).maybeSingle();
  if (lookupError) return failed("look up file", lookupError);
  if (!file) return refuse("file_not_found");

  const at = place.at.toISOString();
  const { error } = await db.from("reading_states").upsert(
    {
      user_id: userId,
      file_id: place.fileId,
      locator: place.locator,
      progress: place.progress,
      last_opened_at: at,
      device_id: place.deviceId,
      client_updated_at: at,
    },
    { onConflict: "user_id,file_id" },
  );
  if (error) return failed("save reading place", error);
  return succeed(null);
}
