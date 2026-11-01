import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_CODES } from '@abapro/shared';

type Messages = { [key: string]: string | Messages };
const directory = join(__dirname, 'locales');
const read = (file: string): Messages => JSON.parse(readFileSync(join(directory, file), 'utf8')) as Messages;

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.entries(messages).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...all, [path]: value } : { ...all, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const english = flatten(read('en.json'));

describe('translations', () => {
  it('has a file for every language', () => {
    expect(readdirSync(directory).filter((file) => file.endsWith('.json')).map((file) => file.replace('.json', '')).sort()).toEqual([...LANGUAGE_CODES].sort());
  });

  for (const code of LANGUAGE_CODES.filter((language) => language !== 'en')) {
    it(`${code} has every key and placeholder of English`, () => {
      const translated = flatten(read(`${code}.json`));
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
      for (const [key, text] of Object.entries(english)) {
        expect(placeholders(translated[key] ?? ''), `${code}: ${key}`).toEqual(placeholders(text));
        expect(translated[key]?.trim(), `${code}: ${key} is empty`).toBeTruthy();
      }
    });
  }
});
