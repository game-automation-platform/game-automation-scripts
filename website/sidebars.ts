import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// One sidebar, read top to bottom: what it is, how it works, how to change it,
// how to ship it, what to look up, how to contribute.
const sidebars: SidebarsConfig = {
  docs: [
    'index',
    {
      type: 'category',
      label: 'Getting started',
      link: {type: 'generated-index', description: 'What the script is, how to build it, and where everything lives.'},
      items: [
        'getting-started/what-this-is',
        'getting-started/setup-and-first-build',
        'getting-started/repo-tour',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      link: {type: 'generated-index', description: 'How the script is put together and why.'},
      items: [
        'architecture/overview',
        'architecture/three-worlds',
        'architecture/the-bundle',
        'architecture/run-lifecycle',
        'architecture/page-router',
        'architecture/play-loop',
        'architecture/settings-model',
        'architecture/build-and-release',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      link: {type: 'generated-index', description: 'Step-by-step recipes for the changes people make most.'},
      items: [
        'guides/add-a-skill',
        'guides/add-a-setting',
        'guides/handle-a-page',
        'guides/add-a-task',
        'guides/logging-and-events',
        'guides/lifecycle-hooks',
        'guides/ui-text-and-languages',
        'guides/test-without-a-device',
        'guides/files-on-the-device',
        'guides/driving-screens',
      ],
    },
    {
      type: 'category',
      label: 'Publishing',
      link: {type: 'generated-index', description: 'Getting a build onto a device, into the catalogue, or into a library of your own.'},
      items: [
        'publishing/build-and-deploy',
        'publishing/release-to-catalogue',
        'publishing/your-own-library-source',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      link: {type: 'generated-index', description: 'Tables to look things up in.'},
      items: [
        'reference/code-map',
        'reference/settings',
        'reference/commands',
        'reference/log-schema',
        'reference/glossary',
        {
          type: 'category',
          label: 'Generated',
          items: ['reference/generated/events', 'reference/generated/page-dispatch'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Contributing',
      link: {type: 'generated-index', description: 'How a change gets in, and the rules it has to follow.'},
      items: [
        'contributing/workflow',
        'contributing/conventions',
        'contributing/windows-and-line-endings',
        'reference/generated/backlog',
      ],
    },
  ],
};

export default sidebars;
