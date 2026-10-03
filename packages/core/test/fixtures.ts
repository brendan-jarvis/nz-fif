import { readFileSync } from 'node:fs';
import { parseFile, type ParseResult } from '../src/index';

export function loadFixture(name: string): ParseResult {
  return parseFile(name, readFileSync(`fixtures/${name}`));
}
