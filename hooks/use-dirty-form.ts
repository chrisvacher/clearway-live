"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfirmDialogProps } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Changes = Record<string, unknown>;
type Save<T extends Changes> = (values: T, fields: readonly (keyof T)[]) => Promise<void | T>;

const equal = (left: unknown, right: unknown) => Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

export function useDirtyForm<T extends Changes>(initial: T) {
  const baseline = useRef(initial);
  const valuesRef = useRef(initial);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const dirtyFields = (Object.keys(values) as (keyof T)[]).filter(key => !equal(values[key], baseline.current[key]));
  const dirty = dirtyFields.length > 0;
  const skipGuard = useRef(false);

  function update(next: T) {
    valuesRef.current = next;
    setValues(next);
  }

  function set<K extends keyof T>(field: K, value: T[K]) {
    setError(null);
    update({ ...valuesRef.current, [field]: value });
  }

  function reset(next = baseline.current) {
    baseline.current = next;
    update(next);
    setError(null);
  }

  async function save(commit: Save<T>) {
    if (pendingSave.current || !dirty) return false;
    const submitted = valuesRef.current;
    pendingSave.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await commit(submitted, dirtyFields) ?? submitted;
      baseline.current = saved;
      const current = valuesRef.current;
      const changedDuringSave = Object.fromEntries(Object.entries(current).filter(([key, value]) => !equal(value, submitted[key])));
      update({ ...saved, ...changedDuringSave });
      toast("Saved");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save changes. Try again.");
      return false;
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }

  const guardNavigation = useCallback((navigate: () => void) => {
    if (!dirty || skipGuard.current) {
      navigate();
      return;
    }
    pendingNavigation.current = navigate;
    setConfirming(true);
  }, [dirty]);

  function cancelNavigation() {
    pendingNavigation.current = null;
    setConfirming(false);
  }

  function leave() {
    const navigate = pendingNavigation.current;
    cancelNavigation();
    reset();
    skipGuard.current = true;
    try {
      navigate?.();
    } finally {
      queueMicrotask(() => { skipGuard.current = false; });
    }
  }

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (skipGuard.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function interceptLink(event: MouseEvent) {
      if (skipGuard.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const target = new URL(link.href, location.href);
      if (!["http:", "https:"].includes(target.protocol)) return;
      if (target.pathname === location.pathname && target.search === location.search && target.origin === location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      guardNavigation(() => link.isConnected ? link.click() : location.assign(target.href));
    }

    // The browser handles hard navigations via beforeunload. Keep a same-document
    // Back or Forward in the editor until the facilitator accepts the move.
    const initialHref = location.href;
    const initialState: unknown = history.state;
    const navigation = (window as Window & { navigation?: { currentEntry?: { index: number } } }).navigation;
    const initialIndex = navigation?.currentEntry?.index;
    let restoring = false;
    function onPopState(event: PopStateEvent) {
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      if (skipGuard.current) return;
      if (location.pathname + location.search === new URL(initialHref).pathname + new URL(initialHref).search) return;
      event.stopImmediatePropagation();
      const currentIndex = navigation?.currentEntry?.index;
      if (initialIndex !== undefined && currentIndex !== undefined && initialIndex !== currentIndex) {
        const distance = currentIndex - initialIndex;
        restoring = true;
        history.go(-distance);
        guardNavigation(() => history.go(distance));
      } else {
        history.pushState(initialState, "", initialHref);
        guardNavigation(() => history.back());
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("click", interceptLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("click", interceptLink, true);
    };
  }, [dirty, guardNavigation]);

  const confirmation: ConfirmDialogProps = {
    open: confirming,
    title: "Leave without saving?",
    description: "Any changes you haven’t saved will be discarded.",
    cancelLabel: "Keep editing",
    confirmLabel: "Leave without saving",
    onCancel: cancelNavigation,
    onConfirm: leave,
  };

  return { values, set, dirtyFields, reset, save, error, saving, discard: () => reset(), guardNavigation, confirmation };
}
