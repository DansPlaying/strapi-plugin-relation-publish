# strapi-plugin-relation-publish

A Strapi v5 plugin that adds a **Publish** button with a confirmation dialog to the relation edit modal in the Content Manager.

## Installation

```bash
npm install strapi-plugin-relation-publish
# or
pnpm add strapi-plugin-relation-publish
```

Register the plugin in your Strapi project's `config/plugins.ts`:

```ts
export default {
  'relation-publish': { enabled: true },
};
```

## How it works

When editing a relation in the Content Manager modal, the plugin injects a **Publish** action button. Clicking it opens a confirmation dialog before publishing the related document.

- Only appears for content types that have Draft & Publish enabled (i.e. have a `status` field).
- Disabled when the document is already published and has no unsaved changes.
- Disabled when viewing the `published` tab.

## Development

```bash
pnpm install
pnpm build        # build the plugin
pnpm test         # run tests
pnpm test:watch   # watch mode
```

## License

MIT
