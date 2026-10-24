"use client";

import { useTranslation } from "react-i18next";
import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useExperience } from "@/components/experience/ExperienceContext";
import { useAppSelector } from "@/store/hooks";
import {
  selectGameStatus,
  selectIsCharging,
  selectIsOverlayOpen,
  selectPromptCard,
} from "@/store/selectors";
import styles from "./TouchControls.module.css";

const STICK_RADIUS = 44;
/** Circumference of the action button's progress ring (r = 34 in a 76 × 76 box). */
const RING_LENGTH = 2 * Math.PI * 34;

/**
 * Optional touch input for keyboard-less devices: a virtual stick (move)
 * and an action button (tap = jump, hold next to a card = open). Both feed
 * the same InputManager the keyboard uses, so all gameplay rules apply.
 *
 * The two controls are labelled (MOVE / JUMP), and next to a card the action
 * button turns into the green HOLD button the prompt refers to, with a ring
 * that fills while it is held.
 */
export default function TouchControls() {
  const { t, i18n } = useTranslation("ui");
  const experience = useExperience();
  const status = useAppSelector(selectGameStatus);
  const overlayOpen = useAppSelector(selectIsOverlayOpen);
  const nearCard = useAppSelector(selectPromptCard) !== null;
  const charging = useAppSelector(selectIsCharging);
  const knobRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const originRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const visible = status === "ready" && !overlayOpen;

  useEffect(() => {
    if (!visible) experience?.input.setVirtualMove(0, 0);
  }, [visible, experience]);

  // Hold progress goes straight to the ring (no React render per frame).
  useEffect(() => {
    if (!experience) return;
    return experience.events.on("chargeProgress", (progress) => {
      if (ringRef.current)
        ringRef.current.style.strokeDashoffset = String(
          RING_LENGTH * (1 - progress),
        );
    });
  }, [experience]);

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
      <div className={styles.control}>
        <div
          className={styles.stick}
          onPointerDown={onStickDown}
          onPointerMove={onStickMove}
          onPointerUp={onStickUp}
          onPointerCancel={onStickUp}
          role="presentation"
        >
          <span
            className={`${styles.chevron} ${styles.up}`}
            aria-hidden="true"
          />
          <span
            className={`${styles.chevron} ${styles.right}`}
            aria-hidden="true"
          />
          <span
            className={`${styles.chevron} ${styles.down}`}
            aria-hidden="true"
          />
          <span
            className={`${styles.chevron} ${styles.left}`}
            aria-hidden="true"
          />
          <div ref={knobRef} className={styles.knob} />
        </div>
        <span className={styles.caption} dir={i18n.dir()} aria-hidden="true">
          {t("touch.moveLabel")}
        </span>
      </div>

      <div className={styles.control}>
        <button
          type="button"
          className={`${styles.action} ${nearCard ? styles.ready : ""} ${charging ? styles.holding : ""}`}
          aria-label={nearCard ? t("touch.openAria") : t("touch.action")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            experience?.input.setVirtualAction(true);
          }}
          onPointerUp={() => experience?.input.setVirtualAction(false)}
          onPointerCancel={() => experience?.input.setVirtualAction(false)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <svg className={styles.ring} viewBox="0 0 76 76" aria-hidden="true">
            <circle
              ref={ringRef}
              cx="38"
              cy="38"
              r="34"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH}
            />
          </svg>
          <span className={styles.actionIcon} aria-hidden="true">
            {nearCard ? "◉" : "▲"}
          </span>
        </button>
        <span
          className={`${styles.caption} ${nearCard ? styles.captionReady : ""}`}
          dir={i18n.dir()}
          aria-hidden="true"
        >
          {nearCard ? t("touch.openLabel") : t("touch.jumpLabel")}
        </span>
      </div>

      <p
        className={`${styles.notice} ${nearCard ? styles.noticeHidden : ""}`}
        dir={i18n.dir()}
      >
        {t("touch.hint")}
      </p>
    </div>
  );
}
