import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTextFromPdfItems, type PageText } from '../../src/lib/page-text.ts';
import { charIndexAt, cleanForSpeech, sentenceIndexAt, splitSentences } from '../../src/lib/speech-text.ts';

const page = (str: string): PageText => ({ str, runs: [{ start: 0, str, eol: false }], hasText: true });
const texts = (str: string) => splitSentences(page(str)).map((s) => s.text);

test('splits on sentence punctuation and keeps closing quotes', () => {
  assert.deepEqual(texts('It was late. "Go home!" she said. Was it over?'), ['It was late.', '"Go home!"', 'she said.', 'Was it over?']);
});

test('does not split after abbreviations, initials or decimals', () => {
  assert.deepEqual(texts('Dr. Watson met J. R. Hart at 3.5 miles, e.g. near St. Ives. Then left.'), [
    'Dr. Watson met J. R. Hart at 3.5 miles, e.g. near St. Ives.',
    'Then left.',
  ]);
});

test('joins words hyphenated across a line and turns line breaks into spaces', () => {
  assert.equal(cleanForSpeech('a remark-\nable\nstory'), 'a remarkable story');
  // A real hyphen before a capital stays.
  assert.equal(cleanForSpeech('Anglo-\nSaxon'), 'Anglo- Saxon');
});

test('ranges point back into the page text, trimmed to the visible characters', () => {
  const str = '  First one.  Second one.\n';
  const [a, b] = splitSentences(page(str));
  assert.equal(str.slice(a.start, a.end), 'First one.');
  assert.equal(str.slice(b.start, b.end), 'Second one.');
});

test('skips sentences with no letters, such as page numbers', () => {
  assert.deepEqual(texts('The end of the chapter.\n\n42\n'), ['The end of the chapter.']);
});

test('blank lines end a sentence even without punctuation', () => {
  assert.deepEqual(texts('Chapter One\n\nIt began here.'), ['Chapter One', 'It began here.']);
});

test('reads a short unpunctuated first line as a heading', () => {
  assert.deepEqual(texts('Chapter 1\nThis is the first line. And more.'), ['Chapter 1', 'This is the first line.', 'And more.']);
});

test('does not mistake a short wrapped line inside a sentence for a heading', () => {
  assert.deepEqual(texts('He finally met the envoy of the\nUnited States at noon.'), ['He finally met the envoy of the United States at noon.']);
});

test('breaks overlong text at a comma near the limit', () => {
  const long = Array.from({ length: 60 }, (_, i) => `item ${i}`).join(', ') + '.';
  const parts = texts(long);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 280));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long);
});

test('finds the sentence containing a character', () => {
  const sentences = splitSentences(page('One. Two. Three.'));
  assert.equal(sentenceIndexAt(sentences, 0), 0);
  assert.equal(sentenceIndexAt(sentences, 6), 1);
  assert.equal(sentenceIndexAt(sentences, 100), 2);
});

test('maps a point on the page to the nearest character', () => {
  const text = pageTextFromPdfItems([
    { str: 'Top line', transform: [10, 0, 0, 10, 0, 100], width: 80, height: 10, hasEOL: true },
    { str: 'Bottom line', transform: [10, 0, 0, 10, 0, 80], width: 110, height: 10, hasEOL: true },
  ]);
  const bottom = text.str.indexOf('Bottom');
  assert.equal(charIndexAt(text, 0, 84), bottom);
  // Halfway along the bottom run lands in its middle.
  assert.equal(charIndexAt(text, 55, 84), bottom + 5);
});
