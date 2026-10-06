import { POLICY_SECTIONS } from "./policy";
import type { Listing, PolicySection } from "./types";
import { normalizeText } from "./validators";

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "are", "not", "must", "any",
  "from", "your", "you", "have", "has", "can", "will", "all", "its", "such",
]);

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Always-relevant sections so style and completeness are always checked. */
const ALWAYS = ["B-1.1", "B-1.2", "B-1.3", "P-2.1", "P-2.2", "P-3.1"];

/**
 * Signal rules: cheap, explainable triggers that guarantee a section is retrieved
 * when the listing contains an obvious cue (contact details, tag stuffing, health
 * claims, price wording...). Keyword overlap alone misses these because the policy
 * text and the offending listing text rarely share vocabulary.
 */
const SIGNALS: { id: string; test: (l: Listing, text: string) => boolean }[] = [
  { id: "P-1.1", test: (_l, t) => /(firearm|ammo|ammunition|explosive|gun|weapon|rifle|pistol)/i.test(t) },
  { id: "P-1.2", test: (_l, t) => /(replica|knock-?off|1:1|counterfeit|fake|copy of|inspired by)/i.test(t) },
  { id: "P-1.3", test: (_l, t) => /(cure|cures|treat|treats|prevent|prevents|diagnos|heal|prescription|medicine|disease|cancer|diabet|anxiety)/i.test(t) },
  { id: "P-2.3", test: (_l, t) => /(\bfrom \$|price on request|ask for|discount|shipping fee|handling fee|contact me)/i.test(t) || /[$₹€£]\s?\d/.test(t) },
  { id: "P-3.3", test: (_l, t) => /(used|refurbished|second.?hand|compatible|works with|fits)/i.test(t) },
  { id: "P-4.2", test: (l, t) => l.category === "Services" || /(guarantee|ranking|approval|income)/i.test(t) },
  { id: "P-5.1", test: (_l, t) => /(whatsapp|call me|text me|\b\d{10}\b|@\w+\.\w+|https?:\/\/|www\.|telegram|pay outside|off.?platform)/i.test(t) },
  { id: "P-5.2", test: (l) => (l.tags ?? []).length > 8 },
  { id: "P-3.2", test: () => true }, // attribute completeness applies to every category
  { id: "P-4.1", test: () => true }, // category fit applies to every listing
];

export function listingText(l: Listing): string {
  return [
    l.title,
    l.description,
    l.category,
    l.seller,
    Object.entries(l.attributes ?? {})
      .map(([k, v]) => `${k} ${v}`)
      .join(" "),
    (l.tags ?? []).join(" "),
  ].join(" ");
}

/**
 * TF-IDF-style keyword retrieval over policy sections. Deterministic and
 * dependency-free; plenty for a 16-section corpus.
 */
export function retrieveSections(
  l: Listing,
  topK = 8,
  corpus: PolicySection[] = POLICY_SECTIONS,
): PolicySection[] {
  const qTokens = new Set(tokens(listingText(l)));
  const docs = corpus.map((s) => tokens(`${s.title} ${s.text}`));
  const df = new Map<string, number>();
  for (const d of docs)
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

  const scored = corpus.map((s, i) => {
    let score = 0;
    const counts = new Map<string, number>();
    for (const t of docs[i]) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, c] of counts) {
      if (!qTokens.has(t)) continue;
      const idf = Math.log(1 + corpus.length / (df.get(t) ?? 1));
      score += (1 + Math.log(c)) * idf;
    }
    // Category-specific boost.
    if (
      l.category &&
      normalizeText(s.text).includes(normalizeText(l.category))
    )
      score += 2;
    return { s, score };
  });

  const picked = new Map<string, PolicySection>();
  const fullText = listingText(l);
  const forced = [
    ...ALWAYS,
    ...SIGNALS.filter((s) => s.test(l, fullText)).map((s) => s.id),
  ];
  for (const id of forced) {
    const sec = corpus.find((x) => x.id === id);
    if (sec) picked.set(id, sec);
  }
  const target = Math.max(topK + ALWAYS.length, picked.size);
  for (const { s } of scored.sort((a, b) => b.score - a.score)) {
    if (picked.size >= target) break;
    if (!picked.has(s.id)) picked.set(s.id, s);
  }
  return [...picked.values()];
}
