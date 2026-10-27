import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnnotationStore, type NewAnnotation } from '../../src/models/annotation-store.ts';
import type { Annotation } from '../../src/models/types.ts';

const highlight: NewAnnotation = { type: 'highlight', page: 3, color: '#FFEB3B', rects: [] };

test('add assigns an id and timestamp and notifies the page', () => {
  const items: Annotation[] = [];
  const store = new AnnotationStore(items);
  const pages: number[] = [];
  store.on('change', (page) => pages.push(page));
  const a = store.add(highlight);
  assert.match(a.id, /^annot-/);
  assert.ok(a.createdAt);
  assert.equal(items.length, 1, 'mutates the persisted array in place');
  assert.deepEqual(pages, [3]);
});

test('undo and redo cover add, update and remove', () => {
  const store = new AnnotationStore([]);
  const a = store.add(highlight);
  store.update(a.id, { color: '#000000' });
  store.remove(a.id);
  assert.equal(store.items.length, 0);

  store.undo(); // un-remove
  assert.equal(store.get(a.id)!.color, '#000000');
  store.undo(); // un-update
  assert.equal(store.get(a.id)!.color, '#FFEB3B');
  store.undo(); // un-add
  assert.equal(store.items.length, 0);
  assert.equal(store.undo(), false);

  store.redo();
  store.redo();
  assert.equal(store.get(a.id)!.color, '#000000');
});

test('non-undoable updates (comment typing) do not create undo steps', () => {
  const store = new AnnotationStore([]);
  const a = store.add(highlight);
  store.update(a.id, { comment: 'draft' }, { undoable: false });
  store.undo();
  assert.equal(store.items.length, 0, 'the only undo step was the add');
});

test('a new edit clears the redo stack', () => {
  const store = new AnnotationStore([]);
  store.add(highlight);
  store.undo();
  store.add({ ...highlight, page: 4 });
  assert.equal(store.redo(), false);
});
