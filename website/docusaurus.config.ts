import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Runs in Node at build time -- no browser APIs here.

const repoUrl = 'https://github.com/game-automation-platform/game-automation-scripts';

const config: Config = {
  title: 'Game Automation Scripts',
  tagline: 'Contributor guide for the Tsum Tsum script',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  // GitHub Pages: https://game-automation-platform.github.io/game-automation-scripts/
  url: 'https://game-automation-platform.github.io',
  baseUrl: '/game-automation-scripts/',
  organizationName: 'game-automation-platform',
  projectName: 'game-automation-scripts',
  trailingSlash: false,

  // A broken link is a build failure, not a warning.
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: ['@docusaurus/theme-mermaid', '@saucelabs/theme-github-codeblock'],

  presets: [
    [
      'classic',
      {
        docs: {
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: `${repoUrl}/tree/main/website/`,
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    navbar: {
      title: 'Game Automation Scripts',
      logo: {
        alt: 'Game Automation Scripts',
        src: 'img/logo.svg',
      },
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
        {href: repoUrl, label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Repositories',
          items: [
            {label: 'game-automation-scripts', href: repoUrl},
            {
              label: 'game-automation-catalogue',
              href: 'https://github.com/game-automation-platform/game-automation-catalogue',
            },
          ],
        },
        {
          title: 'Start here',
          items: [
            {label: 'What this is', to: '/getting-started/what-this-is'},
            {label: 'Add a skill', to: '/guides/add-a-skill'},
            {label: 'Your own library source', to: '/publishing/your-own-library-source'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Thi Nguyen. Apache-2.0.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'powershell', 'json'],
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
