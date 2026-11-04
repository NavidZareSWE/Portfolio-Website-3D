"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { shortHash } from "@/content/commitHash";
import { CONTACT, isOfflineUrl } from "@/content/links";
import { MORE_SKILLS, PRIMARY_SKILLS } from "@/content/skills";
import { STAGE_ID } from "@/config/layout";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectBugsFixed, selectIsTerminalOpen } from "@/store/selectors";
import { sectionOpened } from "@/store/slices/portfolioSlice";
import { terminalClosed } from "@/store/slices/worldSlice";
import { SECTION_IDS, isSectionId } from "@/types";
import HoloFrame, { holoButtonClass } from "./holo/HoloFrame";
import styles from "./Terminal.module.css";

type LineKind = "input" | "output" | "muted" | "accent" | "error";

interface Line {
  id: number;
  kind: LineKind;
  content: ReactNode;
}

/** Commands in the order `help` lists them; also used for Tab completion. */
const COMMANDS = [
  "help",
  "whoami",
  "about",
  "projects",
  "project",
  "skills",
  "experience",
  "education",
  "contact",
  "open",
  "bugs",
  "date",
  "clear",
  "exit",
] as const;
type Command = (typeof COMMANDS)[number];

const ALIASES: Record<string, Command> = {
  ls: "projects",
  cat: "project",
  quit: "exit",
  cls: "clear",
  "?": "help",
};

/** Words the first position completes to: the commands plus the extra shell words. */
const FIRST_WORDS = [...COMMANDS, "git", "sudo", "echo"];

/** Longest prefix shared by every string in `items`. */
function commonPrefix(items: readonly string[]): string {
  if (items.length === 0) return "";
  let prefix = items[0];
  for (const item of items) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** Shortcuts shown as buttons (no keyboard needed on phones). */
const QUICK: Command[] = [
  "help",
  "whoami",
  "projects",
  "skills",
  "experience",
  "contact",
];

const PROMPT = "guest@nzswe:~$";

const KIND_CLASS: Record<LineKind, string> = {
  input: styles.lineInput,
  output: "",
  muted: styles.muted,
  accent: styles.accent,
  error: styles.error,
};
const NAMESPACES = [
  "ui",
  "common",
  "home",
  "about",
  "projects",
  "skills",
  "experience",
  "contactus",
];

interface ProjectCopy {
  title: string;
  desc: string;
  projectURL?: string;
  websiteURL?: string;
}

interface ExperienceItem {
  title: string;
  period: string;
  org: string[];
}

/** Text content of a translated HTML string (the about copy uses inline markup). */
function plain(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "");
  return (
    new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  const external = !href.startsWith("mailto:");
  return (
    <a
      className={styles.link}
      href={href}
      dir="ltr"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/**
 * The walk-up terminal: a small shell whose commands print the portfolio
 * (whoami, projects, skills, experience, contact…) from the same locale
 * files as the section panels. `open <section>` jumps to a panel.
 *
 * Accessibility: modal dialog, focus goes to the command line on open and
 * is trapped inside, Escape closes, and focus returns to the stage. Output
 * is announced politely as it is printed.
 */
export default function Terminal() {
  const open = useAppSelector(selectIsTerminalOpen);
  const bugs = useAppSelector(selectBugsFixed);
  const dispatch = useAppDispatch();
  const { t, i18n } = useTranslation(NAMESPACES);
  const [lines, setLines] = useState<Line[]>([]);
  const [value, setValue] = useState("");
  const nextId = useRef(0);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);

  const print = useCallback((kind: LineKind, ...items: ReactNode[]) => {
    setLines((current) => [
      ...current,
      ...items.map((content) => ({ id: nextId.current++, kind, content })),
    ]);
  }, []);

  const close = useCallback(() => dispatch(terminalClosed()), [dispatch]);

  // Greet on the first open.
  useEffect(() => {
    if (!open || greeted.current) return;
    greeted.current = true;
    print("accent", <span dir="auto">{t("ui:terminal.welcome")}</span>);
  }, [open, print, t]);

  // Focus, Escape, Tab trap, and the held-Space guard while open.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });

    // The Space that opened the terminal may still be held: swallow its
    // key repeats so they do not type spaces into the command line.
    let openingSpaceHeld = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && event.repeat && openingSpaceHeld) {
        event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      // Tab in the command line completes; elsewhere it cycles in the dialog.
      if (document.activeElement === inputRef.current && !event.shiftKey)
        return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input",
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") openingSpaceHeld = false;
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keyup", onKeyUp, { capture: true });
      document.getElementById(STAGE_ID)?.focus({ preventScroll: true });
    };
  }, [open, close]);

  // Keep the newest output in view.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [lines, open]);

  const projects = () =>
    Object.values(
      t("projects:projects", { returnObjects: true }) as Record<
        string,
        ProjectCopy
      >,
    );

  const experienceItems = (key: "items" | "education") => {
    const items = t(`experience:experience.${key}`, { returnObjects: true });
    return Array.isArray(items) ? (items as ExperienceItem[]) : [];
  };

  const printTimeline = (items: ExperienceItem[]) => {
    for (const item of items) {
      print(
        "output",
        <>
          <span className={styles.commit}>* {shortHash(item.title)}</span>{" "}
          <span className={styles.muted} dir="auto">
            {item.period}
          </span>
        </>,
        <span className={styles.indent} dir="auto">
          {item.title}
          {item.org?.length ? ` — ${item.org.join(" · ")}` : ""}
        </span>,
      );
    }
  };

  const openSection = (name: string) => {
    if (!isSectionId(name)) {
      print(
        "error",
        <span dir="auto">{t("ui:terminal.noSection", { name })}</span>,
      );
      return;
    }
    print(
      "muted",
      <span dir="auto">{t("ui:terminal.opening", { name })}</span>,
    );
    // Let the line render, then swap the terminal for the section panel.
    setTimeout(() => {
      dispatch(terminalClosed());
      dispatch(sectionOpened(name));
    }, 450);
  };

  function run(raw: string) {
    const input = raw.trim();
    print("input", input);
    if (!input) return;
    history.current = [input, ...history.current.slice(0, 49)];
    historyIndex.current = -1;

    const [word, ...args] = input.split(/\s+/);
    const name = word.toLowerCase();
    if (name === "sudo") {
      print("accent", <span dir="auto">{t("ui:terminal.sudo")}</span>);
      openSection("contact");
      return;
    }
    if (name === "git" && args[0] === "log") {
      printTimeline(experienceItems("items"));
      return;
    }
    if (name === "echo") {
      print("output", args.join(" "));
      return;
    }
    const command = (COMMANDS as readonly string[]).includes(name)
      ? (name as Command)
      : ALIASES[name];
    if (!command) {
      print(
        "error",
        <span dir="auto">{t("ui:terminal.notFound", { command: word })}</span>,
      );
      return;
    }

    switch (command) {
      case "help": {
        // `help <command>` describes one command; plain `help` lists them all.
        const topic = args[0]?.toLowerCase();
        const known = topic
          ? (COMMANDS as readonly string[]).includes(topic)
            ? (topic as Command)
            : ALIASES[topic]
          : undefined;
        if (topic && !known) {
          print(
            "error",
            <span dir="auto">
              {t("ui:terminal.notFound", { command: args[0] })}
            </span>,
          );
          break;
        }
        print(
          "output",
          ...(known ? [known] : COMMANDS).map((c) => (
            <span key={c} className={styles.helpRow}>
              <span className={styles.command}>{c}</span>
              <span className={styles.muted} dir="auto">
                {t(`ui:terminal.help.${c}`)}
              </span>
            </span>
          )),
        );
        if (!known)
          print("muted", <span dir="auto">{t("ui:terminal.tabHint")}</span>);
        break;
      }
      case "whoami":
        print("accent", <span dir="auto">{t("common:fullName")}</span>);
        print(
          "output",
          <span dir="auto">{t("home:home.small-description.sm1")}</span>,
          <span dir="auto">{t("home:home.small-description.sm2")}</span>,
        );
        break;
      case "about": {
        const about = t("about:about", { returnObjects: true }) as Record<
          string,
          { text?: string; tradeoff?: string }
        >;
        const paragraphs =
          about && typeof about === "object"
            ? Object.values(about).flatMap((part) =>
                [part?.text, part?.tradeoff].filter(
                  (text): text is string => typeof text === "string",
                ),
              )
            : [];
        print(
          "output",
          ...paragraphs.map((text, i) => (
            <span key={i} className={styles.paragraph} dir="auto">
              {plain(text)}
            </span>
          )),
        );
        break;
      }
      case "projects":
        print(
          "output",
          ...projects().map((project, i) => (
            <span key={project.title}>
              <span className={styles.command}>
                {String(i + 1).padStart(2, "0")}
              </span>{" "}
              <span dir="auto">{project.title}</span>
            </span>
          )),
        );
        print("muted", <span dir="auto">{t("ui:terminal.help.project")}</span>);
        break;
      case "project": {
        const list = projects();
        const n = Number.parseInt(args[0] ?? "", 10);
        if (!args[0]) {
          print("error", t("ui:terminal.usage", { usage: "project <n>" }));
          break;
        }
        const project = list[n - 1];
        if (!project) {
          print(
            "error",
            <span dir="auto">
              {t("ui:terminal.noProject", { n: args[0], count: list.length })}
            </span>,
          );
          break;
        }
        print("accent", <span dir="auto">{project.title}</span>);
        print(
          "output",
          <span className={styles.paragraph} dir="auto">
            {project.desc}
          </span>,
        );
        const links: ReactNode[] = [];
        if (project.projectURL)
          links.push(
            <Link key="source" href={project.projectURL}>
              {t("ui:terminal.source")}
            </Link>,
          );
        if (project.websiteURL)
          links.push(
            isOfflineUrl(project.websiteURL) ? (
              <span key="live" className={styles.muted}>
                {t("ui:terminal.offline")}
              </span>
            ) : (
              <Link key="live" href={project.websiteURL}>
                {t("ui:terminal.live")}
              </Link>
            ),
          );
        if (links.length > 0)
          print(
            "output",
            <span>
              {links.map((link, i) => (
                <Fragment key={i}>
                  {i > 0 && " · "}
                  {link}
                </Fragment>
              ))}
            </span>,
          );
        break;
      }
      case "skills":
        print(
          "output",
          ...[
            ...PRIMARY_SKILLS.map((g) => ({
              title: t(`skills:skills.${g.key}`),
              items: g.items,
            })),
            ...MORE_SKILLS.map((g) => ({
              title: t(`skills:skills.more.${g.key}`),
              items: g.items,
            })),
          ].map((group) => (
            <span key={group.title} className={styles.helpRow}>
              <span className={styles.command} dir="auto">
                {group.title}
              </span>
              <span dir="ltr">
                {group.items.map((s) => s.name).join(" · ")}
              </span>
            </span>
          )),
        );
        break;
      case "experience":
        printTimeline(experienceItems("items"));
        break;
      case "education":
        printTimeline(experienceItems("education"));
        break;
      case "contact":
        print(
          "output",
          ...[
            [
              t("common:socials.email"),
              `mailto:${CONTACT.email}`,
              CONTACT.email,
            ],
            [
              t("common:socials.github"),
              CONTACT.github,
              "github.com/NavidZareSWE",
            ],
            [
              t("common:socials.linkedin"),
              CONTACT.linkedin,
              "linkedin.com/in/navid-zare-swe",
            ],
            [
              t("common:socials.telegram"),
              CONTACT.telegram,
              "t.me/NavidZareSWE",
            ],
          ].map(([label, href, text]) => (
            <span key={href} className={styles.helpRow}>
              <span className={styles.command} dir="auto">
                {label}
              </span>
              <Link href={href}>{text}</Link>
            </span>
          )),
        );
        break;
      case "open":
        if (!args[0]) {
          print("error", t("ui:terminal.usage", { usage: "open <section>" }));
          break;
        }
        openSection(args[0].toLowerCase());
        break;
      case "bugs":
        print(
          "output",
          <span dir="auto">{t("ui:terminal.bugs", { count: bugs })}</span>,
        );
        break;
      case "date":
        print(
          "output",
          new Date().toLocaleString(
            i18n.language === "fa" ? "fa-IR" : "en-GB",
            {
              dateStyle: "full",
              timeStyle: "short",
            },
          ),
        );
        break;
      case "clear":
        setLines([]);
        break;
      case "exit":
        close();
        break;
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(value);
    setValue("");
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const past = history.current;
      const next =
        event.key === "ArrowUp"
          ? Math.min(past.length - 1, historyIndex.current + 1)
          : Math.max(-1, historyIndex.current - 1);
      historyIndex.current = next;
      setValue(next >= 0 ? past[next] : "");
      return;
    }
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      complete();
    }
  };

  /** What the argument of `command` can be, with an optional note per option. */
  const argumentOptions = (
    command: string,
  ): { value: string; note?: string }[] => {
    const resolved = (COMMANDS as readonly string[]).includes(command)
      ? command
      : ALIASES[command];
    switch (resolved ?? command) {
      case "open":
        return SECTION_IDS.map((id) => ({ value: id }));
      case "project":
        return projects().map((project, i) => ({
          value: String(i + 1),
          note: project.title,
        }));
      case "help":
        return COMMANDS.map((c) => ({ value: c }));
      case "git":
        return [{ value: "log" }];
      case "sudo":
        return [{ value: "hire-me" }];
      default:
        return [];
    }
  };

  /**
   * Tab: completes the command, or the first argument of `open`, `project`,
   * `help`, `git` and `sudo`. One match is filled in; several fill in their
   * shared start and are listed below the line.
   */
  const complete = () => {
    const words = value.trimStart().split(/\s+/).filter(Boolean);
    const onNewWord = value === "" || /\s$/.test(value);
    const position = onNewWord ? words.length : words.length - 1;
    const prefix = onNewWord
      ? ""
      : (words[words.length - 1] ?? "").toLowerCase();

    let options: { value: string; note?: string }[];
    if (position === 0) options = FIRST_WORDS.map((w) => ({ value: w }));
    else if (position === 1) options = argumentOptions(words[0].toLowerCase());
    else return;

    const matches = options.filter((o) => o.value.startsWith(prefix));
    if (matches.length === 0) {
      if (options.length > 0)
        print("muted", <span dir="auto">{t("ui:terminal.noMatch")}</span>);
      return;
    }
    const head = words.slice(0, position).join(" ");
    const fill = (word: string, done: boolean) =>
      setValue(`${head ? `${head} ` : ""}${word}${done ? " " : ""}`);
    if (matches.length === 1) {
      fill(matches[0].value, true);
      return;
    }
    fill(commonPrefix(matches.map((m) => m.value)), false);
    print(
      "muted",
      ...(matches.some((m) => m.note)
        ? matches.map((m) => (
            <span key={m.value} className={styles.helpRow}>
              <span className={styles.command}>{m.value}</span>
              <span dir="auto">{m.note}</span>
            </span>
          ))
        : [
            <span key="matches" className={styles.suggestions}>
              {matches.map((m) => (
                <span key={m.value} className={styles.command}>
                  {m.value}
                </span>
              ))}
            </span>,
          ]),
    );
  };

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <HoloFrame
        ref={dialogRef}
        index={`TTY · ${t("ui:terminal.title")}`}
        className={styles.window}
        role="dialog"
        aria-modal="true"
        aria-label={t("ui:terminal.label")}
        dir="ltr"
      >
        <button
          type="button"
          className={holoButtonClass(styles.close)}
          onClick={close}
          aria-label={t("ui:terminal.close")}
        >
          {t("ui:overlay.esc")}
        </button>
        <div
          ref={scrollRef}
          className={styles.output}
          aria-live="polite"
          onPointerUp={() => {
            // Clicking the output returns focus to the command line (unless text was selected).
            if (!window.getSelection()?.toString()) inputRef.current?.focus();
          }}
        >
          {lines.map((line) => (
            <p
              key={line.id}
              className={`${styles.line} ${KIND_CLASS[line.kind]}`}
            >
              {line.kind === "input" && (
                <span className={styles.prompt} aria-hidden="true">
                  {PROMPT}{" "}
                </span>
              )}
              {line.content}
            </p>
          ))}
          <form className={styles.inputRow} onSubmit={submit}>
            <label className={styles.prompt} htmlFor="terminal-input">
              {PROMPT}
            </label>
            <input
              ref={inputRef}
              id="terminal-input"
              className={styles.field}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onInputKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              aria-label={t("ui:terminal.input")}
            />
          </form>
        </div>
        <div className={styles.quick}>
          {QUICK.map((command) => (
            <button
              key={command}
              type="button"
              className={styles.chip}
              onClick={() => {
                run(command);
                inputRef.current?.focus({ preventScroll: true });
              }}
            >
              {command}
            </button>
          ))}
        </div>
      </HoloFrame>
    </div>
  );
}
