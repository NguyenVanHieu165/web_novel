const spacingDiacritics: Readonly<Record<string, string>> = {
  "\u00b4": "\u0301", // acute
  "\u0060": "\u0300", // grave
  "\u02ca": "\u0301",
  "\u02cb": "\u0300",
  "\u02c6": "\u0302", // circumflex
  "\u02dc": "\u0303", // tilde
  "\u02d8": "\u0306", // breve
};

/** Repair attached Vietnamese accents; preserve standalone punctuation and text. */
export function normalizeVietnameseText(value: string): string {
  return value.normalize("NFD")
    .replace(/([aeiouyAEIOUY])([\u0300-\u036f\u00b4\u0060\u02ca\u02cb\u02c6\u02dc\u02d8]+)/gu, (_match, vowel: string, accents: string) => {
      const marks = [...new Set([...accents].map(mark => spacingDiacritics[mark] ?? mark))];
      // Shape must precede tone even when malformed source text puts the tone
      // first (a + acute + breve). Do not discard conflicting/unknown marks.
      const shape = marks.filter(mark => /[\u0302\u0306\u031b]/u.test(mark));
      const rest = marks.filter(mark => !/[\u0302\u0306\u031b]/u.test(mark));
      return vowel + shape.join("") + rest.join("");
    })
    .normalize("NFC");
}
