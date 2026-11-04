"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { RootRun, type ArcadeInput, type ArcadeText } from "@/arcade/game";
import { STAGE_ID } from "@/config/layout";
import { useIsTouchOnly } from "@/hooks/useMediaQuery";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectIsArcadeOpen } from "@/store/selectors";
import { arcadeClosed } from "@/store/slices/worldSlice";
import HoloFrame, { holoButtonClass } from "./holo/HoloFrame";
import styles from "./Arcade.module.css";

const LEFT = new Set(["ArrowLeft", "KeyA"]);
const RIGHT = new Set(["ArrowRight", "KeyD"]);
const JUMP = new Set(["Space", "ArrowUp", "KeyW"]);
const CONFIRM = new Set(["Enter", "NumpadEnter"]);

/**
 * The arcade window: ROOT RUN (src/arcade/) drawn on a canvas inside a holo
 * frame. Keyboard: arrows or A/D to run, Space / W / ↑ to jump, Enter to
 * start or continue, Escape to leave. Touch devices get on-screen buttons,
 * and tapping the screen starts or continues.
 */
export default function Arcade() {
  const open = useAppSelector(selectIsArcadeOpen);
  const dispatch = useAppDispatch();
  const touch = useIsTouchOnly();
  const { t, i18n } = useTranslation("ui");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const input = useRef<ArcadeInput>({
    left: false,
    right: false,
    jump: false,
    jumpPressed: false,
    confirmPressed: false,
  });

  const text = useMemo<ArcadeText>(
    () => ({
      rtl: i18n.dir() === "rtl",
      title: "ROOT RUN",
      tagline: t("arcade.tagline"),
      controls: touch ? t("arcade.controlsTouch") : t("arcade.controls"),
      start: touch ? t("arcade.startTouch") : t("arcade.start"),
      level: t("arcade.level"),
      levelNames: {
        localhost: t("arcade.levels.localhost"),
        staging: t("arcade.levels.staging"),
        production: t("arcade.levels.production"),
      },
      phone: t("arcade.phone"),
      root: t("arcade.root"),
      died: t("arcade.died"),
      retry: touch ? t("arcade.retryTouch") : t("arcade.retry"),
      clear: t("arcade.clear"),
      clearSub: t("arcade.clearSub"),
      next: touch ? t("arcade.nextTouch") : t("arcade.next"),
      victory: t("arcade.victory"),
      victorySub: t("arcade.victorySub"),
      again: touch ? t("arcade.againTouch") : t("arcade.again"),
    }),
    [t, i18n, touch],
  );

  const close = () => dispatch(arcadeClosed());

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const game = new RootRun(text);
    const state = input.current;
    dialogRef.current?.focus({ preventScroll: true });

    // The Space that opened the cabinet may still be held: ignore it until released.
    let openingSpaceHeld = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch(arcadeClosed());
        return;
      }
      const code = event.code;
      if (code === "Space" && openingSpaceHeld) {
        event.preventDefault();
        return;
      }
      const handled =
        LEFT.has(code) ||
        RIGHT.has(code) ||
        JUMP.has(code) ||
        CONFIRM.has(code);
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (LEFT.has(code)) state.left = true;
      if (RIGHT.has(code)) state.right = true;
      if (JUMP.has(code)) {
        state.jump = true;
        state.jumpPressed = true;
      }
      if (CONFIRM.has(code)) state.confirmPressed = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const code = event.code;
      if (code === "Space") openingSpaceHeld = false;
      if (LEFT.has(code)) state.left = false;
      if (RIGHT.has(code)) state.right = false;
      if (JUMP.has(code)) state.jump = false;
    };
    const onBlur = () => {
      state.left = state.right = state.jump = false;
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);

    // Size the canvas to its box at the device pixel ratio.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.visibilityState === "visible") {
        game.update(dt, state);
        state.jumpPressed = false;
        state.confirmPressed = false;
        game.render(ctx, canvas.width, canvas.height);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
      state.left = state.right = state.jump = false;
      document.getElementById(STAGE_ID)?.focus({ preventScroll: true });
    };
  }, [open, text, dispatch]);

  // One handler per event; the button is named by its data-button attribute.
  const setButton = (button: string | undefined, down: boolean) => {
    const state = input.current;
    if (button === "left") state.left = down;
    if (button === "right") state.right = down;
    if (button === "jump") {
      state.jump = down;
      if (down) {
        state.jumpPressed = true;
        state.confirmPressed = true;
      }
    }
  };
  const onPadDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setButton(event.currentTarget.dataset.button, true);
  };
  const onPadUp = (event: ReactPointerEvent<HTMLButtonElement>) =>
    setButton(event.currentTarget.dataset.button, false);

  if (!open) return null;

  return (
    <div className={styles.backdrop}>
      <HoloFrame
        ref={dialogRef}
        index={`ARC · ${t("arcade.cabinet")}`}
        className={styles.window}
        role="dialog"
        aria-modal="true"
        aria-label={t("arcade.label")}
        tabIndex={-1}
        dir="ltr"
      >
        <button
          type="button"
          className={holoButtonClass(styles.close)}
          onClick={close}
          aria-label={t("arcade.close")}
        >
          {t("overlay.esc")}
        </button>
        <div className={styles.screen}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label={t("arcade.screen")}
            role="img"
            onPointerDown={() => {
              // Tapping the screen starts or continues (title, level clear, retry).
              input.current.confirmPressed = true;
            }}
          />
        </div>
        {touch && (
          <div className={styles.pad}>
            <div className={styles.dpad}>
              <button
                type="button"
                className={styles.padButton}
                aria-label={t("arcade.left")}
                data-button="left"
                onPointerDown={onPadDown}
                onPointerUp={onPadUp}
                onPointerCancel={onPadUp}
                onContextMenu={(event) => event.preventDefault()}
              >
                ◀
              </button>
              <button
                type="button"
                className={styles.padButton}
                aria-label={t("arcade.right")}
                data-button="right"
                onPointerDown={onPadDown}
                onPointerUp={onPadUp}
                onPointerCancel={onPadUp}
                onContextMenu={(event) => event.preventDefault()}
              >
                ▶
              </button>
            </div>
            <button
              type="button"
              className={`${styles.padButton} ${styles.jump}`}
              aria-label={t("arcade.jump")}
              data-button="jump"
              onPointerDown={onPadDown}
              onPointerUp={onPadUp}
              onPointerCancel={onPadUp}
              onContextMenu={(event) => event.preventDefault()}
            >
              ▲
            </button>
          </div>
        )}
      </HoloFrame>
    </div>
  );
}
