import { describe, expect, it } from 'vitest';
import { csvRows } from '../src/parsers/tabular';

describe('csvRows (RFC 4180)', () => {
  it('handles quotes, escaped quotes, commas and newlines inside quotes', () => {
    expect(csvRows('a,"b,c","d ""q"""\r\n1,"multi\nline",3\n')).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['1', 'multi\nline', '3'],
    ]);
  });
  it('keeps empty fields and skips blank lines', () => {
    expect(csvRows('a,,c\n\n,,\n1,2,\n')).toEqual([['a', '', 'c'], ['1', '2', '']]);
  });
  it('handles a final line without newline and CR-only endings', () => {
    expect(csvRows('x,y\ry,z')).toEqual([['x', 'y'], ['y', 'z']]);
  });
});
