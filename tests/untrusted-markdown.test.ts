import { test } from 'vitest';
import assert from 'node:assert/strict';
import { renderUntrustedMarkdown } from '../src/lib/untrusted-markdown.ts';

test('code from the AI keeps < and > (escaped once, not twice)', () => {
  assert.equal(renderUntrustedMarkdown('Np. `while licznik < 3:`'), '<p>Np. <code>while licznik &lt; 3:</code></p>\n');
  assert.match(renderUntrustedMarkdown('```python\nif a > 1:\n    pass\n```'), /if a &gt; 1:/);
  assert.equal(renderUntrustedMarkdown('3 < 5'), '<p>3 &lt; 5</p>\n');
});

test('raw HTML from the AI is shown as text', () => {
  const html = renderUntrustedMarkdown('<img src=x onerror=alert(1)> i <b>tekst</b>');
  assert.doesNotMatch(html, /<img|<b>/);
  assert.match(html, /&lt;img/);
});

test('only http(s) links become links; images become their description', () => {
  assert.match(renderUntrustedMarkdown('[docs](https://docs.python.org)'), /<a href="https:\/\/docs.python.org"/);
  assert.doesNotMatch(renderUntrustedMarkdown('[klik](javascript:alert(1))'), /<a/);
  assert.doesNotMatch(renderUntrustedMarkdown('![opis](https://x.pl/a.png)'), /<img/);
});
