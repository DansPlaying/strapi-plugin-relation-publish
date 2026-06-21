import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { RelationPublishAction } from '../index';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPublish = vi.fn().mockResolvedValue({});
const mockFormatMessage = vi.fn(({ defaultMessage }: { defaultMessage: string }) => defaultMessage);

let mockFormState = { modified: false, values: {} as Record<string, unknown> };

vi.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: mockFormatMessage }),
}));

vi.mock('@strapi/strapi/admin', () => ({
  unstable_useDocumentActions: () => ({ publish: mockPublish }),
  useForm: (_key: string, selector: (state: typeof mockFormState) => unknown) =>
    selector(mockFormState),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const baseProps = {
  activeTab: 'draft',
  documentId: 'doc-123',
  model: 'api::article.article',
  collectionType: 'collection-types',
  document: { id: 1, status: 'draft', publishedAt: null },
  meta: {},
};

const callAction = (props = baseProps) =>
  renderHook(() => RelationPublishAction(props));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RelationPublishAction', () => {
  beforeEach(() => {
    mockPublish.mockClear();
    mockFormState = { modified: false, values: {} };
  });

  // ── Null guard ─────────────────────────────────────────────────────────

  it('returns null when document exists but has no status field (non-D&P content type)', () => {
    const { result } = callAction({ ...baseProps, document: { id: 1, title: 'No status' } });
    expect(result.current).toBeNull();
  });

  it('does NOT return null when document is undefined', () => {
    const { result } = callAction({ ...baseProps, document: undefined });
    expect(result.current).not.toBeNull();
  });

  it('does NOT return null when document has status field', () => {
    const { result } = callAction();
    expect(result.current).not.toBeNull();
  });

  // ── Return shape ───────────────────────────────────────────────────────

  it('returns a well-formed action object', () => {
    const { result } = callAction();
    expect(result.current).toMatchObject({
      position: ['relation-modal'],
      loading: false,
      label: 'Publish',
      dialog: {
        type: 'dialog',
        title: 'Publish content',
        content: expect.stringContaining('Are you sure'),
        loading: false,
        onConfirm: expect.any(Function),
      },
    });
  });

  // ── disabled logic ─────────────────────────────────────────────────────

  it('is disabled when activeTab is "published"', () => {
    const { result } = callAction({ ...baseProps, activeTab: 'published' });
    expect(result.current?.disabled).toBe(true);
  });

  it('is disabled when not modified and document is already published', () => {
    const { result } = callAction({
      ...baseProps,
      document: { status: 'published', publishedAt: '2024-01-01T00:00:00.000Z' },
    });
    expect(result.current?.disabled).toBe(true);
  });

  it('is NOT disabled when modified=true even if document is published', () => {
    mockFormState = { modified: true, values: {} };
    const { result } = callAction({
      ...baseProps,
      document: { status: 'published', publishedAt: '2024-01-01T00:00:00.000Z' },
    });
    expect(result.current?.disabled).toBe(false);
  });

  it('is disabled when not modified and no documentId', () => {
    const { result } = callAction({ ...baseProps, documentId: '' });
    expect(result.current?.disabled).toBe(true);
  });

  it('is NOT disabled for a new draft document when form is modified', () => {
    mockFormState = { modified: true, values: {} };
    const { result } = callAction({ ...baseProps, documentId: '' });
    expect(result.current?.disabled).toBe(false);
  });

  // ── isDocumentPublished ────────────────────────────────────────────────

  it('treats document with publishedAt as published', () => {
    // Not modified, has publishedAt → disabled (= published + unmodified)
    const { result } = callAction({
      ...baseProps,
      document: { status: 'published', publishedAt: '2024-01-01T00:00:00.000Z' },
    });
    expect(result.current?.disabled).toBe(true);
  });

  it('treats document with status "modified" as NOT published even if publishedAt is set', () => {
    // status=modified means there are unpublished draft changes
    const { result } = callAction({
      ...baseProps,
      document: { status: 'modified', publishedAt: '2024-01-01T00:00:00.000Z' },
    });
    expect(result.current?.disabled).toBe(false);
  });

  it('recognises published state from meta.availableStatus when document has no publishedAt', () => {
    const { result } = callAction({
      ...baseProps,
      document: { status: 'draft', publishedAt: null },
      meta: { availableStatus: [{ publishedAt: '2024-01-01T00:00:00.000Z' }] },
    });
    // Not modified, published via meta → disabled
    expect(result.current?.disabled).toBe(true);
  });

  it('does not treat meta.availableStatus with all-null publishedAt as published', () => {
    const { result } = callAction({
      ...baseProps,
      document: { status: 'draft', publishedAt: null },
      meta: { availableStatus: [{ publishedAt: null }] },
    });
    expect(result.current?.disabled).toBe(false);
  });

  // ── handlePublish ──────────────────────────────────────────────────────

  it('calls publish with the correct collectionType, model, documentId, and form values', async () => {
    const values = { title: 'Hello' };
    mockFormState = { modified: false, values };
    const { result } = callAction();

    await act(async () => {
      await result.current!.dialog.onConfirm();
    });

    expect(mockPublish).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledWith(
      {
        collectionType: baseProps.collectionType,
        model: baseProps.model,
        documentId: baseProps.documentId,
      },
      values
    );
  });

  it('sets loading=true during publish and restores it to false after', async () => {
    let resolvePublish!: () => void;
    mockPublish.mockImplementation(
      () => new Promise<void>((resolve) => { resolvePublish = resolve; })
    );

    const { result } = callAction();

    // Kick off without awaiting
    act(() => { result.current!.dialog.onConfirm(); });

    expect(result.current!.loading).toBe(true);
    expect(result.current!.dialog.loading).toBe(true);

    await act(async () => { resolvePublish(); });

    expect(result.current!.loading).toBe(false);
    expect(result.current!.dialog.loading).toBe(false);
  });

  it('resets loading to false even if publish throws', async () => {
    mockPublish.mockRejectedValueOnce(new Error('Network error'));

    const { result } = callAction();

    // handlePublish has finally but no catch — the error propagates, loading still resets
    await act(async () => {
      await result.current!.dialog.onConfirm().catch(() => {});
    });

    expect(result.current!.loading).toBe(false);
  });
});

// ── Plugin bootstrap ───────────────────────────────────────────────────────

describe('plugin.bootstrap', () => {
  let plugin: typeof import('../index').default;
  let addDocumentActionFn: (actions: any[]) => any[];

  beforeEach(async () => {
    plugin = (await import('../index')).default;
  });

  const buildApp = (hasContentManager = true) => ({
    registerPlugin: vi.fn(),
    getPlugin: vi.fn().mockReturnValue(
      hasContentManager
        ? {
            apis: {
              addDocumentAction: vi.fn((fn: (actions: any[]) => any[]) => {
                addDocumentActionFn = fn;
              }),
            },
          }
        : null
    ),
  });

  it('does nothing when content-manager plugin is missing', () => {
    const app = buildApp(false);
    expect(() => plugin.bootstrap(app)).not.toThrow();
  });

  it('inserts RelationPublishAction before the update action', () => {
    const app = buildApp();
    plugin.bootstrap(app);
    const result = addDocumentActionFn([{ type: 'other' }, { type: 'update' }]);

    const publishIdx = result.findIndex((a: any) => a === RelationPublishAction);
    const updateIdx = result.findIndex((a: any) => a.type === 'update');
    expect(publishIdx).toBeGreaterThanOrEqual(0);
    expect(publishIdx).toBeLessThan(updateIdx);
  });

  it('appends RelationPublishAction when no update action exists', () => {
    const app = buildApp();
    plugin.bootstrap(app);
    const result = addDocumentActionFn([{ type: 'delete' }]);

    expect(result.at(-1)).toBe(RelationPublishAction);
  });

  it('preserves all existing actions', () => {
    const app = buildApp();
    plugin.bootstrap(app);
    const existing = [{ type: 'delete' }, { type: 'update' }];
    const result = addDocumentActionFn(existing);

    for (const action of existing) {
      expect(result).toContain(action);
    }
  });
});

// ── Plugin register ────────────────────────────────────────────────────────

describe('plugin.register', () => {
  it('registers the plugin with the correct id and name', async () => {
    const plugin = (await import('../index')).default;
    const mockApp = { registerPlugin: vi.fn() };
    plugin.register(mockApp);
    expect(mockApp.registerPlugin).toHaveBeenCalledWith({
      id: 'relation-publish',
      name: 'relation-publish',
    });
  });
});
