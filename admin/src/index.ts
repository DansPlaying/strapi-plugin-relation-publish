import React from 'react';
import { useIntl } from 'react-intl';
import { unstable_useDocumentActions, useForm } from '@strapi/strapi/admin';

// document and meta come from the relation modal's action props (already loaded — no extra fetch needed)
const RelationPublishAction = ({
  activeTab,
  documentId,
  model,
  collectionType,
  document,
  meta,
}: {
  activeTab: string;
  documentId: string;
  model: string;
  collectionType: string;
  document: any;
  meta: any;
}) => {
  const { formatMessage } = useIntl();
  const { publish } = unstable_useDocumentActions();
  const [loading, setLoading] = React.useState(false);

  const modified = useForm('RelationPublishAction', (state) => state.modified);
  const values = useForm('RelationPublishAction', (state) => state.values);

  // Skip for content types without draft/publish (no status field on the document)
  if (document && !('status' in document)) return null;

  // Match Strapi's original isDocumentPublished logic:
  // published (has publishedAt in doc or available statuses) AND not in 'modified' state
  // (status 'modified' means saved draft changes that still need publishing)
  const isDocumentPublished =
    (Boolean(document?.publishedAt) ||
      Boolean(meta?.availableStatus?.some((s: any) => s.publishedAt !== null))) &&
    document?.status !== 'modified';

  const handlePublish = async () => {
    setLoading(true);
    try {
      await publish({ collectionType, model, documentId }, values ?? {});
    } finally {
      setLoading(false);
    }
  };

  return {
    // position must be in the returned object — Strapi's relation modal filters by this
    position: ['relation-modal'],
    loading,
    disabled:
      activeTab === 'published' ||
      (!modified && isDocumentPublished) ||
      (!modified && !documentId),
    label: formatMessage({ id: 'app.utils.publish', defaultMessage: 'Publish' }),
    dialog: {
      type: 'dialog',
      title: formatMessage({
        id: 'relation-publish.dialog.title',
        defaultMessage: 'Publish content',
      }),
      content: formatMessage({
        id: 'relation-publish.dialog.message',
        defaultMessage:
          'Are you sure you want to publish these changes? This will make the content publicly available.',
      }),
      loading,
      onConfirm: handlePublish,
    },
  };
};

RelationPublishAction.type = 'relation-publish';
RelationPublishAction.position = ['relation-modal'];

export { RelationPublishAction };

export default {
  register(app: any) {
    app.registerPlugin({
      id: 'relation-publish',
      name: 'relation-publish',
    });
  },
  bootstrap(app: any) {
    const contentManager = app.getPlugin('content-manager');
    if (!contentManager) return;

    contentManager.apis.addDocumentAction((actions: any[]) => {
      // Insert before UpdateAction (Save) so our action becomes the primary button
      // (relation modal renders [secondaryAction, primaryAction] from [index0, index1])
      const updateIndex = actions.findIndex((a) => a.type === 'update');
      if (updateIndex === -1) return [...actions, RelationPublishAction];
      return [
        ...actions.slice(0, updateIndex),
        RelationPublishAction,
        ...actions.slice(updateIndex),
      ];
    });
  },
};
