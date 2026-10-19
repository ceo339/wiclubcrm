"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OnbResult } from "../actions";

/** Запуск серверного действия: ошибка (ключ перевода) и обновление страницы после успеха. */
export function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<OnbResult>, onOk?: (r: OnbResult) => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        onOk?.(r);
        router.refresh();
      }
    });
  }
  return { pending, error, run, setError };
}
