/**
 * Типы модуля «Онбординг». Таблицы живут в схеме `onboarding` (не `public`),
 * поэтому в общем `src/types/database.ts` их нет: модуль описывает строки сам.
 * Без зависимостей, можно импортировать и на клиенте.
 */

export type Owner = "curator" | "marketing" | "finance";
export type ItemStatus = "todo" | "progress" | "done" | "moved";
export type LinkMode = "template" | "copy" | "none";
export type OnbStatus = "onboarding" | "opened";
export type WeekKind = "week" | "rhythm" | "school";
export type AssigneeKind = "partner" | "hq";

export const OWNERS: Owner[] = ["curator", "marketing", "finance"];
export const ITEM_STATUSES: ItemStatus[] = ["todo", "progress", "done", "moved"];

export type TemplateWeek = {
  key: string;
  kind: WeekKind;
  num: number | null;
  title: string;
  sort: number;
};

export type TemplateItem = {
  id: string;
  week_key: string;
  block: string;
  title: string;
  action: string;
  doc_type: string;
  owner: Owner;
  tags: string[];
  link_mode: LinkMode;
  template_url: string | null;
  sort: number;
  archived: boolean;
  /** Подпапка в папке партнера, куда класть копию (01–06). */
  drive_folder: string | null;
  /** id оригинала на Диске для копии партнеру. */
  drive_file_id: string | null;
};

/** Подпапки в папке партнера: всегда в этом порядке, даже пустые. */
export const PARTNER_SUBFOLDERS = ["01 Договор", "02 Финансы", "03 Маркетинг", "04 Продажи", "05 Залы и оборудование", "06 Школа мастеров"];

/** id файла из ссылки Google Диска (docs.google.com/.../d/ID или drive.google.com/file/d/ID, ?id=ID). */
export function driveFileIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.match(/\/d\/([\w-]{20,})/)?.[1] ?? url.match(/[?&]id=([\w-]{20,})/)?.[1] ?? null;
}

export type Onboarding = {
  id: string;
  candidate_id: string;
  partner_id: string | null;
  city: string | null;
  start_date: string | null;
  curator: string | null;
  call_day: string | null;
  current_week: number | null;
  status: OnbStatus;
  opened_at: string | null;
  drive_folder_url: string | null;
  /** Постоянная ссылка на еженедельный звонок в Zoom (видит и партнер). */
  zoom_url: string | null;
  next_call_at: string | null;
  created_at: string;
};

export type PlanItem = {
  id: string;
  onboarding_id: string;
  template_item_id: string | null;
  week_key: string;
  block: string;
  title: string;
  action: string;
  doc_type: string;
  owner: Owner;
  tags: string[];
  link_mode: LinkMode;
  template_url: string | null;
  file_url: string | null;
  status: ItemStatus;
  done_date: string | null;
  custom: boolean;
  hidden: boolean;
  sort: number;
};

export type Milestone = {
  id: string;
  onboarding_id: string;
  date: string | null;
  title: string;
  is_key: boolean;
  sort: number;
};

export type MeetingNumber = { label: string; value: string; note: string };

export type Meeting = {
  id: string;
  onboarding_id: string;
  held_on: string;
  week: number | null;
  participants: string | null;
  done_items: string[];
  notes: string[];
  numbers: MeetingNumber[];
  created_at: string;
};

export type Task = {
  id: string;
  onboarding_id: string;
  meeting_id: string | null;
  title: string;
  assignee: string;
  assignee_kind: AssigneeKind;
  due: string | null;
  done: boolean;
  created_at: string;
};

/** Карточка партнера в обзоре. */
export type OnboardingCard = Onboarding & {
  candidate_name: string;
  done: number;
  total: number;
  open_tasks: number;
  last_meeting: string | null;
};

/** Все данные страницы одного партнера. */
export type OnboardingFull = {
  onb: Onboarding;
  candidate_name: string;
  weeks: TemplateWeek[];
  items: PlanItem[];
  milestones: Milestone[];
  meetings: Meeting[];
  tasks: Task[];
  /** Только для hq: эталонный шаблон (вкладка «Шаблон онбординга»). */
  template: TemplateItem[] | null;
};

/** Кандидат, которому можно начать онбординг (договор отправлен и дальше). */
export type StartableCandidate = { id: string; name: string; city: string | null };

/** Кандидат для формы «+ Клуб»: подставляем город и почту из анкеты. */
export type ClubCandidate = StartableCandidate & { email: string | null; hasOnboarding: boolean };

/** Пункт входит в прогресс, если он в неделях 1-10, не убран и не перенесен. */
export function countsForProgress(i: Pick<PlanItem, "week_key" | "hidden" | "status">): boolean {
  return /^w\d+$/.test(i.week_key) && !i.hidden && i.status !== "moved";
}

export function progress(items: Pick<PlanItem, "week_key" | "hidden" | "status">[]): { done: number; total: number; pct: number } {
  const list = items.filter(countsForProgress);
  const done = list.filter((i) => i.status === "done").length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}
