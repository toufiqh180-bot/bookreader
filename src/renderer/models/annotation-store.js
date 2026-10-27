/**
 * Owns a book's annotations, with undo/redo.
 *
 * Events:
 *   'change' (page: number)  — any add/update/remove touching that page
 *
 * @typedef {'highlight'|'underline'|'squiggly'|'strikeout'|'note'|'freehand'} AnnotationType
 *
 * @typedef {object} Annotation
 * @property {string} id
 * @property {AnnotationType} type
 * @property {number} page                    1-based
 * @property {string} color                   CSS hex
 * @property {string} createdAt               ISO-8601
 * @property {string} [updatedAt]
 * @property {string} [textQuoted]            text under a markup / note anchor
 * @property {import('../lib/geometry.js').PdfRect[]} [rects]  markup lines, or the note pin box
 * @property {string} [comment]
 * @property {'pen'|'marker'} [tool]          freehand only
 * @property {number} [strokeWidth]           freehand only, PDF units
 * @property {Array<Array<{x:number,y:number}>>} [paths]  freehand only, PDF space
 */
import { Emitter, nowIso, uid } from '../lib/util.js';

const UNDO_LIMIT = 100;

export class AnnotationStore extends Emitter {
  /** @param {Annotation[]} annotations  mutated in place (it is the persisted array) */
  constructor(annotations) {
    super();
    this.items = annotations;
    this.undoStack = [];
    this.redoStack = [];
  }

  get(id) {
    return this.items.find((a) => a.id === id) ?? null;
  }

  onPage(page) {
    return this.items.filter((a) => a.page === page);
  }

  /** @param {Omit<Annotation, 'id'|'createdAt'>} fields */
  add(fields) {
    const annotation = { id: uid('annot'), createdAt: nowIso(), ...fields };
    this.#insert(annotation);
    this.#record({ undo: () => this.#delete(annotation.id), redo: () => this.#insert(annotation) });
    return annotation;
  }

  /**
   * @param {string} id
   * @param {Partial<Annotation>} patch
   * @param {{ undoable?: boolean }} [options]  typing in a comment box is not
   *        worth an undo step per keystroke, so callers can opt out.
   */
  update(id, patch, { undoable = true } = {}) {
    const annotation = this.get(id);
    if (!annotation) return;
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, annotation[k]]));
    const apply = (values) => {
      Object.assign(annotation, values, { updatedAt: nowIso() });
      this.emit('change', annotation.page);
    };
    apply(patch);
    if (undoable) this.#record({ undo: () => apply(before), redo: () => apply(patch) });
  }

  remove(id) {
    const annotation = this.get(id);
    if (!annotation) return null;
    this.#delete(id);
    this.#record({ undo: () => this.#insert(annotation), redo: () => this.#delete(id) });
    return annotation;
  }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return false;
    step.undo();
    this.redoStack.push(step);
    return true;
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return false;
    step.redo();
    this.undoStack.push(step);
    return true;
  }

  #insert(annotation) {
    this.items.push(annotation);
    this.emit('change', annotation.page);
  }

  #delete(id) {
    const index = this.items.findIndex((a) => a.id === id);
    if (index < 0) return;
    const [annotation] = this.items.splice(index, 1);
    this.emit('change', annotation.page);
  }

  #record(step) {
    this.undoStack.push(step);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }
}
