"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CONTACT, cloudinaryThumb, isOfflineUrl } from "@/content/links";
import {
  KNOWLEDGE_KEYS,
  MORE_COUNT,
  MORE_SKILLS,
  PRIMARY_SKILLS,
  type Skill,
} from "@/content/skills";
import type { SectionId } from "@/types";
import HoloFrame from "./holo/HoloFrame";
import RichText from "./RichText";
import styles from "./SectionContent.module.css";

/*
 * Every section is rendered from the i18next namespaces (/locales/<lng>/):
 * the main site's own content (common, home, about, projects, skills,
 * contactus), plus `experience` (from the résumé) and `ui` (labels).
 */

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className={styles.link}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

function Offline() {
  const { t } = useTranslation("ui");
  return <span className={styles.offline}>{t("projects.offline")}</span>;
}

/* ----------------------------------------------------------------- About */

interface AboutCopy {
  introduction: { text: string };
  currentWork: { text: string };
  sideWork: { text: string };
  howIWork: { text: string; tradeoff: string };
  outsideWork: { text: string };
}

function About() {
  const { t } = useTranslation();
  const about = t("about:about", { returnObjects: true }) as AboutCopy;
  const cv = t("home:home.download-cv.link");
  return (
    <div className={styles.stack}>
      <div className={styles.hello}>
        <span className={styles.greeting}>{t("home:home.greetings")}</span>
        <p className={styles.iAm}>
          {t("ui:about.iAm", { name: t("common:firstName") })}{" "}
          <span aria-hidden="true">👋</span>
        </p>
        <p className={styles.roleLine}>
          {t("home:home.small-description.sm1")}
          <br />
          {t("home:home.small-description.sm2")}
        </p>
      </div>
      <p className={styles.lead}>
        <RichText html={about.introduction.text} />
      </p>
      <p className={styles.body}>
        <RichText html={about.currentWork.text} />
      </p>
      <p className={styles.body}>
        <RichText html={about.sideWork.text} />
      </p>
      <p className={styles.body}>
        <RichText html={about.howIWork.text} />{" "}
        <RichText html={about.howIWork.tradeoff} />
      </p>
      <p className={styles.body}>
        <RichText html={about.outsideWork.text} />
      </p>
      {/* The CV link is "#" in the locale files until a file is published. */}
      {cv && cv !== "#" && (
        <p>
          <External href={cv}>{t("home:home.download-cv.name")}</External>
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Projects */

interface ProjectCopy {
  title: string;
  desc: string;
  images?: string[];
  projectURL?: string;
  websiteURL?: string;
}

/** Projects whose public repository is one component of the work, not the work itself. */
const SOURCE_LABEL: Record<string, string> = {
  project1: "projects.editorSource",
};

function Projects() {
  const { t } = useTranslation();
  const projects = t("projects:projects", { returnObjects: true }) as Record<
    string,
    ProjectCopy
  >;
  return (
    <ol className={styles.list}>
      {Object.entries(projects).map(([key, project], i) => {
        const images = project.images ?? [];
        const offline = isOfflineUrl(project.websiteURL);
        return (
          <li key={key}>
            <HoloFrame
              compact
              scanlines={false}
              index={String(i + 1).padStart(2, "0")}
              className={styles.card}
            >
              <h3 className={styles.cardTitle}>{project.title}</h3>
              {images.length > 0 && (
                <ul
                  className={styles.shots}
                  aria-label={t("ui:projects.screenshots")}
                >
                  {images.slice(0, 4).map((src, n) => (
                    <li key={src}>
                      <a
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("ui:projects.openImage", {
                          n: n + 1,
                          title: project.title,
                        })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary thumbnails */}
                        <img
                          src={cloudinaryThumb(src)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={240}
                          height={150}
                        />
                      </a>
                    </li>
                  ))}
                  {images.length > 4 && (
                    <li className={styles.moreShots}>+{images.length - 4}</li>
                  )}
                </ul>
              )}
              <p className={styles.body}>{project.desc}</p>
              <div className={styles.links}>
                {project.projectURL && (
                  <External href={project.projectURL}>
                    {t(`ui:${SOURCE_LABEL[key] ?? "projects.source"}`)}
                  </External>
                )}
                {project.websiteURL &&
                  (offline ? (
                    <Offline />
                  ) : (
                    <External href={project.websiteURL}>
                      {t("ui:projects.live")}
                    </External>
                  ))}
              </div>
            </HoloFrame>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- Skills */

function SkillChips({ items }: { items: Skill[] }) {
  return (
    <ul className={styles.skills}>
      {items.map((skill) => (
        <li key={skill.name} className={styles.skill} dir="ltr">
          {/* The main site's logos in their own colours (many have a background
              shape, so they cannot be drawn as a single-colour mask). */}
          <span className={styles.skillIcon} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static SVGs, no optimisation needed */}
            <img
              src={skill.icon}
              alt=""
              width={18}
              height={18}
              loading="lazy"
              className={skill.invert ? styles.skillIconInvert : undefined}
              style={
                skill.scale ? { transform: `scale(${skill.scale})` } : undefined
              }
            />
          </span>
          {skill.name}
        </li>
      ))}
    </ul>
  );
}

function Skills() {
  const { t } = useTranslation("skills");
  const [showMore, setShowMore] = useState(false);
  const moreId = useId();
  return (
    <div className={styles.stack}>
      {PRIMARY_SKILLS.map((group) => (
        <section key={group.key} className={styles.group}>
          <h3 className={styles.groupTitle}>{t(`skills.${group.key}`)}</h3>
          <SkillChips items={group.items} />
        </section>
      ))}
      <section className={styles.group}>
        <h3 className={styles.groupTitle}>{t("skills.knowledge.title")}</h3>
        <ul className={styles.points}>
          {KNOWLEDGE_KEYS.map((key) => (
            <li key={key}>{t(`skills.knowledge.${key}`)}</li>
          ))}
        </ul>
      </section>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={showMore}
        aria-controls={moreId}
        onClick={() => setShowMore((value) => !value)}
      >
        {showMore
          ? t("skills.more.toggleClose")
          : t("skills.more.toggleOpen", { count: MORE_COUNT })}
      </button>
      <div id={moreId} hidden={!showMore} className={styles.stack}>
        {MORE_SKILLS.map((group) => (
          <section key={group.key} className={styles.group}>
            <h3 className={styles.groupTitle}>
              {t(`skills.more.${group.key}`)}
            </h3>
            <SkillChips items={group.items} />
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Experience */

interface ExperienceItem {
  title: string;
  period: string;
  org: string[];
  points: string[];
  /** Company site, shown as plain text (never linked: the ARPut sites are offline). */
  site?: { label: string };
  link?: { label: string; href: string };
  href?: string;
}

function Timeline({ items }: { items: ExperienceItem[] }) {
  return (
    <ol className={styles.timeline}>
      {items.map((item) => (
        <li key={item.title} className={styles.entry}>
          <p className={styles.period}>{item.period}</p>
          <h4 className={styles.cardTitle}>{item.title}</h4>
          <p className={styles.org}>
            {item.href ? (
              <External href={item.href}>{item.org.join(" · ")}</External>
            ) : (
              item.org.join(" · ")
            )}
            {item.site && (
              <>
                {" · "}
                <span dir="ltr">{item.site.label}</span>
              </>
            )}
          </p>
          <ul className={styles.points}>
            {item.points.map((point) => (
              <li key={point}>
                <RichText html={point} />
              </li>
            ))}
          </ul>
          {item.link && (
            <p className={styles.links}>
              <External href={item.link.href}>{item.link.label}</External>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function Experience() {
  const { t } = useTranslation("experience");
  const items = t("experience.items", {
    returnObjects: true,
  }) as ExperienceItem[];
  const education = t("experience.education", {
    returnObjects: true,
  }) as ExperienceItem[];
  return (
    <div className={styles.stack}>
      <h3 className={styles.groupTitle}>{t("experience.heading")}</h3>
      <Timeline items={items} />
      <h3 className={styles.groupTitle}>{t("experience.educationHeading")}</h3>
      <Timeline items={education} />
    </div>
  );
}

/* --------------------------------------------------------------- Contact */

type FormState = "idle" | "sending" | "success" | "error" | "mailto";
const WEB3FORMS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;

function ContactForm() {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>("idle");

  // Same service as the main site (web3forms), keyed by NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY.
  // Without a key the form still works: it opens the visitor's email app with
  // the message filled in, addressed to the contact email.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!WEB3FORMS_KEY) {
      const name = String(data.get("name") ?? "");
      const subject = t("ui:contact.form.subject", { name });
      const body = `${String(data.get("message") ?? "")}\n\n— ${name} <${String(data.get("email") ?? "")}>`;
      window.location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setState("mailto");
      return;
    }
    setState("sending");
    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
        }),
      });
      const result = (await response.json()) as { success?: boolean };
      setState(result.success ? "success" : "error");
      if (result.success) form.reset();
    } catch {
      setState("error");
    }
  }

  const status =
    state === "success"
      ? t("ui:contact.form.success")
      : state === "error"
        ? t("ui:contact.form.error")
        : state === "mailto"
          ? t("ui:contact.form.mailto")
          : "";

  return (
    <form className={styles.form} onSubmit={submit}>
      <h3 className={styles.groupTitle}>
        {t("contactus:contactus.sendMessage")}
      </h3>
      <label className={styles.field}>
        <span>{t("contactus:contactus.fullName")}</span>
        <input name="name" required autoComplete="name" />
      </label>
      <label className={styles.field}>
        <span>{t("contactus:contactus.email")}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
        />
      </label>
      <label className={styles.field}>
        <span>{t("contactus:contactus.typeYourMessage")}</span>
        <textarea name="message" required rows={4} />
      </label>
      <button
        type="submit"
        className={styles.toggle}
        disabled={state === "sending"}
      >
        {state === "sending"
          ? t("ui:contact.form.sending")
          : t("contactus:contactus.send")}
      </button>
      <p className={styles.formStatus} role="status">
        {status}
      </p>
    </form>
  );
}

function Contact() {
  const { t, i18n } = useTranslation();
  const comma = i18n.language === "fa" ? "، " : ", ";
  const channels = [
    {
      label: t("common:socials.email"),
      value: CONTACT.email,
      href: `mailto:${CONTACT.email}`,
      external: false,
    },
    {
      label: t("common:socials.github"),
      value: "github.com/NavidZareSWE",
      href: CONTACT.github,
      external: true,
    },
    {
      label: t("common:socials.linkedin"),
      value: "linkedin.com/in/navid-zare-swe",
      href: CONTACT.linkedin,
      external: true,
    },
    {
      label: t("common:socials.telegram"),
      value: "t.me/NavidZareSWE",
      href: CONTACT.telegram,
      external: true,
    },
  ];
  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        {t("contactus:contactus.interestedInHiringMe")}
      </p>
      <h3 className={styles.groupTitle}>
        {t("contactus:contactus.connectWithUs")}
      </h3>
      <ul className={styles.channels}>
        {channels.map((channel) => (
          <li key={channel.href} className={styles.channel}>
            <span className={styles.channelLabel}>{channel.label}</span>
            <a
              className={styles.link}
              href={channel.href}
              dir="ltr"
              {...(channel.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {channel.value}
            </a>
          </li>
        ))}
        <li className={styles.channel}>
          <span className={styles.channelLabel}>
            {t("contactus:contactus.address.name")}
          </span>
          <External href={CONTACT.map}>
            {t("contactus:contactus.address.address-city")}
            {comma}
            {t("contactus:contactus.address.address-country-province")}
          </External>
        </li>
      </ul>
      <ContactForm />
    </div>
  );
}

/** Layout per section; all copy comes from the locale files. */
export default function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case "about":
      return <About />;
    case "projects":
      return <Projects />;
    case "skills":
      return <Skills />;
    case "experience":
      return <Experience />;
    case "contact":
      return <Contact />;
  }
}
