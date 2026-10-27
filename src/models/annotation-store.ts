/**
 * Owns a book's annotations, with undo/redo. Emits `change(page)` whenever an
 * annotation on that page is added, edited or removed.
 */
import { Emitter, nowIso, uid } from '../lib/util.ts';
import type { Annotation } from './types.ts';

const UNDO_LIMIT = 100;

interface Step {
  undo: () => void;
  redo: () => void;
}

export type NewAnnotation = Omit<Annotation, 'id' | 'createdAt'>;

export class AnnotationStore extends Emitter<{ change: [page: number] }> {
  readonly items: Annotation[];
  #undoStack: Step[] = [];
  #redoStack: Step[] = [];

  /** @param annotations mutated in place — it is the persisted array */
  constructor(annotations: Annotation[]) {
    super();
    this.items = annotations;
  }

  get(id: string): Annotation | null {
    return this.items.find((a) => a.id === id) ?? null;
  }

  onPage(page: number): Annotation[] {
    return this.items.filter((a) => a.page === page);
  }

  add(fields: NewAnnotation): Annotation {
    const annotation: Annotation = { id: uid('annot'), createdAt: nowIso(), ...fields };
    this.#insert(annotation);
    this.#record({ undo: () => this.#delete(annotation.id), redo: () => this.#insert(annotation) });
    return annotation;
  }

  /**
   * @param undoable typing in a comment box isn't worth an undo step per
   *        keystroke, so callers can opt out.
   */
  update(id: string, patch: Partial<Annotation>, { undoable = true } = {}): void {
    const annotation = this.get(id);
    if (!annotation) return;
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, annotation[k as keyof Annotation]])) as Partial<Annotation>;
    const apply = (values: Partial<Annotation>) => {
      Object.assign(annotation, values, { updatedAt: nowIso() });
      this.emit('change', annotation.page);
    };
    apply(patch);
    if (undoable) this.#record({ undo: () => apply(before), redo: () => apply(patch) });
  }

  remove(id: string): Annotation | null {
    const annotation = this.get(id);
    if (!annotation) return null;
    this.#delete(id);
    this.#record({ undo: () => this.#insert(annotation), redo: () => this.#delete(id) });
    return annotation;
  }

  undo(): boolean {
    const step = this.#undoStack.pop();
    if (!step) return false;
    step.undo();
    this.#redoStack.push(step);
    return true;
  }

  redo(): boolean {
    const step = this.#redoStack.pop();
    if (!step) return false;
    step.redo();
    this.#undoStack.push(step);
    return true;
  }

  #insert(annotation: Annotation): void {
    this.items.push(annotation);
    this.emit('change', annotation.page);
  }

  #delete(id: string): void {
    const index = this.items.findIndex((a) => a.id === id);
    if (index < 0) return;
    const [annotation] = this.items.splice(index, 1);
    this.emit('change', annotation.page);
  }

  #record(step: Step): void {
    this.#undoStack.push(step);
    if (this.#undoStack.length > UNDO_LIMIT) this.#undoStack.shift();
    this.#redoStack = [];
  }
}
