/**
 * Skill groups and icons, as listed on the main site's Skills page (only
 * items backed by the résumé or shipped GitHub work). Group names are
 * translated through the `skills` namespace; tool names are not translated.
 */
export interface Skill {
  name: string;
  /** File in /public/skills (from the main site's icon set). */
  icon: string;
  /** Black, single-colour logos are inverted to white on the dark panel. */
  invert?: boolean;
  /** Logos drawn small inside a padded canvas are scaled up (values from the main site). */
  scale?: number;
}

const s = (
  name: string,
  icon: string,
  options: Omit<Skill, "name" | "icon"> = {},
): Skill => ({
  name,
  icon: `/skills/${icon}.svg`,
  ...options,
});

export const PRIMARY_SKILLS: {
  key: "frontend" | "backend" | "tools";
  items: Skill[];
}[] = [
  {
    key: "frontend",
    items: [
      s("HTML", "html"),
      s("CSS", "css"),
      s("JavaScript", "javascript"),
      s("TypeScript", "typescript"),
      s("Tailwind", "tailwind"),
      s("React", "react"),
      s("Next.js", "nextjs"),
    ],
  },
  {
    key: "backend",
    items: [
      s("Node.js", "node-js"),
      s("Express.js", "express-js"),
      s("JWT", "jwt"),
      s("Knex", "knex"),
      s("PostgreSQL", "postgresql"),
      s("MongoDB", "mongodb"),
    ],
  },
  {
    key: "tools",
    items: [
      s("Git", "git"),
      s("GitHub", "github", { invert: true }),
      s("Bash", "bash"),
      s("Linux (Ubuntu)", "ubuntu"),
    ],
  },
];

export const KNOWLEDGE_KEYS = [
  "responsiveDesign",
  "stateManagement",
  "workingWithRestfulApisAndAxios",
  "performanceOptimizationAndCleanCode",
  "testingAndDebugging",
  "collaboration",
] as const;

export const MORE_SKILLS: {
  key: "alsoFamiliar" | "ides" | "packageManagersAndTools";
  items: Skill[];
}[] = [
  {
    key: "alsoFamiliar",
    items: [
      s("Java", "java"),
      s("Arduino Uno", "arduino-uno", { scale: 1.3 }),
      s("Adobe Photoshop", "adobe-photoshop"),
      s("Adobe Premiere Pro", "adobe-premiere"),
      s("Adobe After Effects", "adobe-after-effects"),
      s("Microsoft Hyper-V", "microsoft-hyper-v", { scale: 3.3 }),
      s("Microsoft Excel", "microsoft-excel"),
      s("Microsoft Word", "microsoft-word"),
      s("Microsoft PowerPoint", "microsoft-powerpoint"),
    ],
  },
  {
    key: "ides",
    items: [
      s("Visual Studio Code", "visual-studio-code"),
      s("Visual Studio", "visual-studio"),
      s("IntelliJ", "intelij"),
      s("Sublime Text", "sublime-text"),
      s("Eclipse", "eclipse"),
    ],
  },
  {
    key: "packageManagersAndTools",
    items: [
      s("PNPM", "pnpm"),
      s("NPM", "npm"),
      s("Android Studio", "android-studio"),
      s("Postman", "postman"),
      s("CodePen", "codepen", { invert: true }),
      s("Swiper.js", "swiper-js"),
    ],
  },
];

export const MORE_COUNT = MORE_SKILLS.reduce(
  (sum, group) => sum + group.items.length,
  0,
);
