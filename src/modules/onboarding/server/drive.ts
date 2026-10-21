import { createSign } from "node:crypto";

/**
 * Google Диск через сервисный аккаунт («робот» Google), без сторонних библиотек.
 *
 * Переменные окружения (Vercel, только сервер):
 * - GOOGLE_SERVICE_ACCOUNT_JSON: JSON-ключ сервисного аккаунта целиком (или он же в base64).
 * - ONBOARDING_DRIVE_PARENT_ID: папка, где создаются папки партнеров.
 *   По умолчанию «Franch WiClub» на общем диске womaninsight.club.
 *
 * Робот должен быть участником общего диска (роль «Менеджер контента» или выше):
 * у сервисного аккаунта нет своего места на «Моем диске», поэтому работаем только на общем диске.
 */

const DEFAULT_PARENT = "12WsOvY0w1ZPJxAHgyGSfGznesuZ2dnq_"; // Franch WiClub
const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

/** Office-файлы при копировании превращаем в Google Документы / Таблицы / Презентации. */
const CONVERT: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "application/vnd.google-apps.document",
  "application/msword": "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "application/vnd.google-apps.spreadsheet",
  "application/vnd.ms-excel": "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "application/vnd.google-apps.presentation",
};

type ServiceAccount = { client_email: string; private_key: string };

function readKey(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const json = JSON.parse(text) as Partial<ServiceAccount>;
    if (!json.client_email || !json.private_key) return null;
    return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

export function isDriveConfigured(): boolean {
  return readKey() !== null;
}

export function driveParentId(): string {
  return process.env.ONBOARDING_DRIVE_PARENT_ID?.trim() || DEFAULT_PARENT;
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = readKey();
  if (!key) throw new Error("onbErrDriveNotConfigured");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(key.private_key).toString("base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google: ${data.error_description ?? res.status}`);
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function call<T>(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const token = await accessToken();
  const q = new URLSearchParams({ supportsAllDrives: "true", ...(init.query ?? {}) });
  const res = await fetch(`${API}${path}?${q}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Google Drive: ${data.error?.message ?? res.status}`);
  return data;
}

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink: string };
const FIELDS = "id,name,mimeType,webViewLink";

export async function getFile(id: string): Promise<DriveFile> {
  return call<DriveFile>(`/files/${id}`, { query: { fields: FIELDS } });
}

/** Папка с таким именем внутри parent; если уже есть, возвращает ее (повторный запуск не плодит дубли). */
export async function ensureFolder(name: string, parent: string): Promise<DriveFile> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType = '${FOLDER}' and trashed = false`;
  const found = await call<{ files: DriveFile[] }>("/files", {
    query: { q, fields: `files(${FIELDS})`, includeItemsFromAllDrives: "true", corpora: "allDrives" },
  });
  if (found.files?.[0]) return found.files[0];
  return call<DriveFile>("/files", {
    method: "POST",
    query: { fields: FIELDS },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
  });
}

/** Копия оригинала в папку партнера; Word/Excel/PowerPoint становятся Google-файлами. */
export async function copyFile(fileId: string, name: string, parent: string): Promise<DriveFile> {
  const src = await getFile(fileId);
  const body: Record<string, unknown> = { name, parents: [parent] };
  if (CONVERT[src.mimeType]) body.mimeType = CONVERT[src.mimeType];
  return call<DriveFile>(`/files/${fileId}/copy`, { method: "POST", query: { fields: FIELDS }, body: JSON.stringify(body) });
}

/** Доступ на редактирование (письмо-приглашение уходит от Google). */
export async function shareWriter(fileId: string, email: string): Promise<void> {
  await call(`/files/${fileId}/permissions`, {
    method: "POST",
    query: { sendNotificationEmail: "true", fields: "id" },
    body: JSON.stringify({ type: "user", role: "writer", emailAddress: email }),
  });
}

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}
