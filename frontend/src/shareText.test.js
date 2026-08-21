import { describe, it, expect } from 'vitest';
import { shareTextFor, shareTextAsPlainText } from './shareText';

describe('shareTextFor', () => {
  it('prefers the enrichment summary over the raw body', () => {
    const item = {
      title: 'Pier 66 laundry',
      body: 'Lookup if Pier 66 has laundry.',
      enrichment: { summary: 'Yes, Pier 66 has a guest laundry facility.' },
      url: 'https://example.org/pier66',
    };
    expect(shareTextFor(item)).toEqual({
      title: 'Pier 66 laundry',
      text: 'Yes, Pier 66 has a guest laundry facility.',
      url: 'https://example.org/pier66',
    });
  });

  it('falls back to the body when there is no enrichment', () => {
    const item = { title: 'A todo', body: 'Buy milk', enrichment: null, url: null };
    expect(shareTextFor(item)).toEqual({ title: 'A todo', text: 'Buy milk', url: undefined });
  });

  it('falls back to capture_id when there is no title', () => {
    const item = { title: null, capture_id: '2026-08-11-13-30-10-pm', body: 'x', enrichment: null };
    expect(shareTextFor(item).title).toBe('2026-08-11-13-30-10-pm');
  });
});

describe('shareTextAsPlainText', () => {
  it('joins title, text, and url, skipping a missing url', () => {
    const item = { title: 'A todo', body: 'Buy milk', enrichment: null, url: null };
    expect(shareTextAsPlainText(item)).toBe('A todo\n\nBuy milk');
  });

  it('includes the url when present', () => {
    const item = {
      title: 'Pier 66 laundry',
      body: 'x',
      enrichment: { summary: 'Yes.' },
      url: 'https://example.org/pier66',
    };
    expect(shareTextAsPlainText(item)).toBe('Pier 66 laundry\n\nYes.\n\nhttps://example.org/pier66');
  });
});
