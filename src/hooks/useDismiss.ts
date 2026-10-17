"use client";

import { useEffect, type RefObject } from "react";

export function useDismissOnOutsidePointerOrEscape(
  rootRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rootRef, isOpen, setOpen]);
}
