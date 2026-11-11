import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

let ui;
beforeEach(() => { ui = loadApp(); });

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(ui.esc('<script>alert("x") & \'y\'</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;');
  });
  it('turns null and undefined into an empty string and numbers into text', () => {
    expect(ui.esc(null)).toBe('');
    expect(ui.esc(undefined)).toBe('');
    expect(ui.esc(0)).toBe('0');
  });
});

describe('money', () => {
  it('formats with a dollar sign and thousands separators', () => {
    expect(ui.money(5000)).toBe('$5,000');
    expect(ui.money('12500')).toBe('$12,500');
    expect(ui.money(0)).toBe('$0');
  });
});

describe('label and badge', () => {
  it('label replaces underscores with spaces', () => expect(ui.label('IN_PROGRESS')).toBe('IN PROGRESS'));
  it('badge gives a lowercase class and a readable label', () => {
    expect(ui.badge('IN_PROGRESS')).toBe('<span class="badge b-in_progress">IN PROGRESS</span>');
    expect(ui.badge('PENDING')).toContain('b-pending');
  });
  it('badge escapes its input', () => expect(ui.badge('<b>')).not.toContain('<b>'));
});

describe('options', () => {
  it('builds options from values and marks the selected one', () => {
    const html = ui.options(['A', 'B'], 'B');
    expect(html).toContain('<option value="A">A</option>');
    expect(html).toContain('<option value="B" selected>B</option>');
  });
  it('supports [value, text] pairs and compares values as strings', () => {
    const html = ui.options([[1, 'One'], [2, 'Two']], '2');
    expect(html).toContain('<option value="1">One</option>');
    expect(html).toContain('<option value="2" selected>Two</option>');
  });
  it('escapes values and text', () => expect(ui.options([['"', '<']], '')).toBe('<option value="&quot;">&lt;</option>'));
});

describe('paginate and pager', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  it('returns the requested page and the total number of pages', () => {
    expect(ui.paginate(items, 1, 12)).toMatchObject({ page: 1, pages: 3, items: items.slice(0, 12) });
    expect(ui.paginate(items, 3, 12).items).toEqual([25]);
  });
  it('keeps the page within range', () => {
    expect(ui.paginate(items, 99, 12).page).toBe(3);
    expect(ui.paginate(items, 0, 12).page).toBe(1);
    expect(ui.paginate(items, -4, 12).page).toBe(1);
  });
  it('handles an empty list as a single empty page', () => expect(ui.paginate([], 1, 12)).toMatchObject({ page: 1, pages: 1, items: [] }));
  it('pager shows nothing for one page, and disables Prev / Next at the ends', () => {
    expect(ui.pager(ui.paginate([1, 2], 1, 12))).toBe('');
    const first = ui.pager(ui.paginate(items, 1, 12));
    expect(first).toContain('Page 1 of 3');
    expect(first).toMatch(/data-page="0" disabled/);
    expect(first).toMatch(/data-page="2">Next/);
    expect(ui.pager(ui.paginate(items, 3, 12))).toMatch(/data-page="4" disabled/);
  });
});

describe('thumb', () => {
  it('builds a coloured block with the category name, and a bigger version on request', () => {
    expect(ui.thumb({ id: 3, categoryName: 'Kitchen' })).toContain('<span>Kitchen</span>');
    expect(ui.thumb({ id: 3 }, true)).toContain('class="thumb big"');
  });
  it('uses the same colour for the same listing and escapes the category name', () => {
    expect(ui.thumb({ id: 5, categoryName: 'A' })).toBe(ui.thumb({ id: 5, categoryName: 'A' }));
    expect(ui.thumb({ id: 5, categoryName: '<i>' })).not.toContain('<i>');
  });
});

describe('fmtDate', () => {
  it('formats a timestamp as day, month and year', () => expect(ui.fmtDate(Date.UTC(2026, 10, 10, 12))).toMatch(/10 Nov 2026/));
});
