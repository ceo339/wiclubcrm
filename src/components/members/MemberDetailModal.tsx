"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addMemberComment,
  addMemberTask,
  getMemberDetail,
  setAttendance,
  setMemberTaskDone,
  updateMember,
  type MemberDetail,
} from "@/app/members/actions";
import { attendedArray, STATUSES, statusLabel } from "@/lib/members";
import type { Member } from "./types";

export default function MemberDetailModal({
  member,
  canEdit,
  onClose,
}: {
  member: Member;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMemberDetail(member.id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    getMemberDetail(member.id).then(setDetail);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{member.name}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {member.city ?? "—"}
              {member.member_since ? ` · с ${member.member_since}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-muted hover:text-ink-2"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {editing ? (
          <EditForm member={member} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
        ) : (
          <ReadView member={member} canEdit={canEdit} onEdit={() => setEditing(true)} />
        )}

        {member.product_sessions ? (
          <AttendanceSection member={member} canEdit={canEdit} />
        ) : null}

        <CommentsSection memberId={member.id} detail={detail} canEdit={canEdit} onChanged={refresh} />
        <TasksSection memberId={member.id} detail={detail} canEdit={canEdit} onChanged={refresh} />
      </div>
    </div>
  );
}

function ReadView({
  member,
  canEdit,
  onEdit,
}: {
  member: Member;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Курс</dt>
        <dd className="text-ink-2">{member.product_name ?? "—"}</dd>
        <dt className="text-muted">Статус</dt>
        <dd className="text-ink-2">{statusLabel(member.status)}</dd>
        <dt className="text-muted">Начало</dt>
        <dd className="text-ink-2">{member.start_date ?? "—"}</dd>
        <dt className="text-muted">Сумма</dt>
        <dd className="text-ink-2">{member.price_collected ? `€${member.price_collected}` : "—"}</dd>
      </dl>

      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
        >
          Редактировать
        </button>
      )}
    </>
  );
}

function EditForm({
  member,
  onCancel,
  onSaved,
}: {
  member: Member;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateMember(member.id, formData);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">Имя</span>
        <input
          name="name"
          defaultValue={member.name}
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">Статус</span>
        <select
          name="status"
          defaultValue={member.status}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">Город</span>
        <input
          name="city"
          defaultValue={member.city ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">Дата начала</span>
        <input
          name="start_date"
          type="date"
          defaultValue={member.start_date ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">Сумма (€)</span>
        <input
          name="price_collected"
          type="number"
          defaultValue={String(member.price_collected ?? 0)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink-2">Участница с</span>
        <input
          name="member_since"
          defaultValue={member.member_since ?? ""}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </label>

      {error && (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-strong">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "..." : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

function AttendanceSection({ member, canEdit }: { member: Member; canEdit: boolean }) {
  const sessions = member.product_sessions ?? 0;
  const [attended, setAttended] = useState(() => attendedArray(member.attended, sessions));
  const [pending, startTransition] = useTransition();

  function cycle(index: number) {
    if (!canEdit) return;
    const current = attended[index];
    const next = current === null ? true : current === true ? false : null;
    const optimistic = [...attended];
    optimistic[index] = next;
    setAttended(optimistic);
    startTransition(async () => {
      await setAttendance(member.id, index, next);
    });
  }

  const present = attended.filter((v) => v === true).length;
  const marked = attended.filter((v) => v !== null).length;
  const pct = marked > 0 ? Math.round((present / marked) * 100) : null;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">Посещаемость</span>
        <span className="text-xs text-muted">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {attended.map((v, i) => (
          <button
            key={i}
            type="button"
            disabled={!canEdit || pending}
            onClick={() => cycle(i)}
            title={`Занятие ${i + 1}`}
            className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium ${
              v === true
                ? "border-accent bg-accent/10 text-accent-strong"
                : v === false
                  ? "border-border bg-surface-2 text-muted line-through"
                  : "border-dashed border-border text-muted"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Клик по занятию переключает: не отмечено → была → не была.</p>
    </div>
  );
}

function CommentsSection({
  memberId,
  detail,
  canEdit,
  onChanged,
}: {
  memberId: string;
  detail: MemberDetail | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addMemberComment(memberId, text);
      if (res.error) setError(res.error);
      else {
        setText("");
        onChanged();
      }
    });
  }

  return (
    <div className="mt-5">
      <span className="text-xs font-medium text-ink-2">Комментарии</span>
      {detail === null ? (
        <p className="mt-2 text-xs text-muted">Загрузка…</p>
      ) : detail.comments.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Пока нет комментариев</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {detail.comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-surface-2 p-2 text-xs">
              <div className="flex items-center justify-between text-muted">
                <span className="font-medium text-ink-2">{c.author}</span>
                <span>{new Date(c.created_at).toLocaleString("ru-RU")}</span>
              </div>
              <p className="mt-1 text-ink-2">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Добавить комментарий…"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          {error && <p className="text-xs text-accent-strong">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || !text.trim()}
            className="self-start rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  );
}

function TasksSection({
  memberId,
  detail,
  canEdit,
  onChanged,
}: {
  memberId: string;
  detail: MemberDetail | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addMemberTask(memberId, text, due || null);
      if (res.error) setError(res.error);
      else {
        setText("");
        setDue("");
        onChanged();
      }
    });
  }

  function handleToggle(taskId: string, done: boolean) {
    startTransition(async () => {
      await setMemberTaskDone(taskId, done);
      onChanged();
    });
  }

  const tasks = detail?.tasks ?? [];
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="mt-5">
      <span className="text-xs font-medium text-ink-2">Задачи</span>
      {detail === null ? (
        <p className="mt-2 text-xs text-muted">Загрузка…</p>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Пока нет задач</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {[...open, ...done].map((task) => (
            <label key={task.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={task.done}
                disabled={!canEdit || pending}
                onChange={(e) => handleToggle(task.id, e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span className={task.done ? "flex-1 text-muted line-through" : "flex-1 text-ink-2"}>
                {task.text}
              </span>
              {task.due_date && <span className="text-muted">{task.due_date}</span>}
            </label>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Новая задача…"
            className="min-w-[140px] flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || !text.trim()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
          >
            + Задача
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-accent-strong">{error}</p>}
    </div>
  );
}
