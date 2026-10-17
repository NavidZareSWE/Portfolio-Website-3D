"use client";

import { useTranslation } from "react-i18next";
import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useExperience } from "@/components/experience/ExperienceContext";
import { useAppSelector } from "@/store/hooks";
import { selectGameStatus, selectIsOverlayOpen } from "@/store/selectors";
import styles from "./TouchControls.module.css";

const STICK_RADIUS = 44;

/**
 * Optional touch input for keyboard-less devices: a virtual stick (move)
 * and an action button (tap = jump, hold next to a card = open). Both feed
 * the same InputManager the keyboard uses, so all gameplay rules apply.
 */
export default function TouchControls() {
  const { t, i18n } = useTranslation("ui");
  const experience = useExperience();
  const status = useAppSelector(selectGameStatus);
  const overlayOpen = useAppSelector(selectIsOverlayOpen);
  const knobRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const visible = status === "ready" && !overlayOpen;

  useEffect(() => {
    if (!visible) experience?.input.setVirtualMove(0, 0);
  }, [visible, experience]);

  const setKnob = (dx: number, dy: number) => {
    if (knobRef.current)
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onStickDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    originRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      id: event.pointerId,
    };
    onStickMove(event);
  };

  const onStickMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = originRef.current;
    if (!origin || origin.id !== event.pointerId) return;
    let dx = event.clientX - origin.x;
    let dy = event.clientY - origin.y;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS) {
      dx = (dx / length) * STICK_RADIUS;
      dy = (dy / length) * STICK_RADIUS;
    }
    setKnob(dx, dy);
    // Screen up is "forward"; small dead zone avoids drift.
    const nx = dx / STICK_RADIUS;
    const ny = -dy / STICK_RADIUS;
    const magnitude = Math.hypot(nx, ny);
    experience?.input.setVirtualMove(
      magnitude < 0.12 ? 0 : nx,
      magnitude < 0.12 ? 0 : ny,
    );
  };

  const onStickUp = () => {
    originRef.current = null;
    setKnob(0, 0);
    experience?.input.setVirtualMove(0, 0);
  };

  return (
    <div className={`${styles.controls} ${visible ? styles.visible : ""}`}>
      <div
        className={styles.stick}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
        role="presentation"
      >
        <div ref={knobRef} className={styles.knob} />
      </div>
      <button
        type="button"
        className={styles.action}
        aria-label={t("touch.action")}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          experience?.input.setVirtualAction(true);
        }}
        onPointerUp={() => experience?.input.setVirtualAction(false)}
        onPointerCancel={() => experience?.input.setVirtualAction(false)}
        onContextMenu={(event) => event.preventDefault()}
      >
        ◉
      </button>
      <p className={styles.notice} dir={i18n.dir()}>
        {t("touch.hint")}
      </p>
    </div>
  );
}
