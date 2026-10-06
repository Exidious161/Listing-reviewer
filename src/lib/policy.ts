import type { PolicySection } from "./types";

/**
 * Marketplace policy (P-*) and brand-content guide (B-*).
 * Original text written for this project; the app retrieves from these sections
 * and every AI finding must cite one of them.
 */
export const POLICY_SECTIONS: PolicySection[] = [
  {
    id: "P-1.1",
    doc: "policy",
    title: "Prohibited items: weapons and dangerous goods",
    text: "Listings for firearms, ammunition, explosives, and weapon parts are prohibited. Knives are allowed only when sold as kitchen or outdoor tools and described as such. Items designed to injure people are not permitted in any category.",
  },
  {
    id: "P-1.2",
    doc: "policy",
    title: "Prohibited items: counterfeit and unauthorized goods",
    text: "Listings must not offer counterfeit, replica, or 'inspired by' goods that use another brand's name or logo. Words such as replica, copy, knockoff, or 1:1 combined with a brand name are prohibited. Genuine resale must state the item is authentic and used or new.",
  },
  {
    id: "P-1.3",
    doc: "policy",
    title: "Prohibited items: regulated health products",
    text: "Listings must not offer prescription medicines, controlled substances, or products claiming to diagnose, treat, cure, or prevent disease. Supplements and personal care products may describe ingredients and usage but not medical outcomes.",
  },
  {
    id: "P-2.1",
    doc: "policy",
    title: "Accuracy: no misleading claims",
    text: "Titles and descriptions must be accurate. Claims such as 'best', '#1', 'guaranteed results', or 'doctor recommended' are misleading unless the seller can document them. Superlatives must be removed or replaced with factual, measurable statements.",
  },
  {
    id: "P-2.2",
    doc: "policy",
    title: "Accuracy: unverifiable and absolute claims",
    text: "Absolute statements such as 'lifetime warranty', '100% safe', 'works for everyone', 'never breaks', or 'certified' must be supported by evidence the seller can show. Any such claim without a stated basis is flagged as unverifiable and should be removed or qualified with specifics such as warranty length and terms.",
  },
  {
    id: "P-2.3",
    doc: "policy",
    title: "Accuracy: pricing and fees",
    text: "The listed price must be the price the buyer pays for the item described. Titles and descriptions must not contain pricing tricks such as 'from $X', 'price on request', or 'ask for discount'. Shipping or handling fees must not be hidden in the description.",
  },
  {
    id: "P-3.1",
    doc: "policy",
    title: "Completeness: required product facts",
    text: "Every listing must state what the item is, its condition (new, used, refurbished), and its key specifications. Electronics must list model or capacity; clothing must list size and material; services must state what is included and the unit of pricing.",
  },
  {
    id: "P-3.2",
    doc: "policy",
    title: "Completeness: attributes by category",
    text: "Attributes must match the category. Home & Kitchen needs material; Electronics needs model or specifications; Clothing & Accessories needs size and material; Services needs duration or scope. Missing category attributes make a listing incomplete.",
  },
  {
    id: "P-3.3",
    doc: "policy",
    title: "Completeness: condition and compatibility",
    text: "Used or refurbished items must disclose visible wear and functional limits. Accessories and parts must state which models they are compatible with. Vague phrases like 'works with most devices' are not acceptable.",
  },
  {
    id: "P-4.1",
    doc: "policy",
    title: "Categories: correct and supported category",
    text: "Listings must use one of the supported categories and be placed in the category that best matches the item. Placing an item in an unrelated category to gain visibility is not permitted.",
  },
  {
    id: "P-4.2",
    doc: "policy",
    title: "Categories: services listings",
    text: "Services must describe the work performed, duration, area served, and what is not included. Services that promise outcomes (for example guaranteed ranking, guaranteed approval, or guaranteed income) are not permitted.",
  },
  {
    id: "P-5.1",
    doc: "policy",
    title: "Seller conduct: contact and off-platform dealing",
    text: "Listings must not direct buyers to complete payment or communication off the platform, and must not include personal phone numbers, emails, or external links in titles or descriptions.",
  },
  {
    id: "P-5.2",
    doc: "policy",
    title: "Seller conduct: keyword stuffing and tags",
    text: "Titles and tags must describe the item. Repeating keywords, listing unrelated brands, or using more than eight tags is keyword stuffing and must be corrected.",
  },
  {
    id: "B-1.1",
    doc: "brand",
    title: "Brand voice: tone and style",
    text: "Write in a clear, friendly, factual tone. Avoid ALL CAPS words, excessive exclamation marks, emojis in titles, and sales hype such as 'amazing', 'must-have', or 'unbeatable'. Prefer short sentences and concrete details.",
  },
  {
    id: "B-1.2",
    doc: "brand",
    title: "Brand voice: title format",
    text: "Titles should follow the pattern: product type, key attribute, then size or model. Keep titles under 80 characters, use title case, and do not include price, shipping, or promotional text in the title.",
  },
  {
    id: "B-1.3",
    doc: "brand",
    title: "Brand voice: description structure",
    text: "Descriptions should open with one sentence on what the item is, followed by key specifications, then condition and what is included. Use plain language and measurable values with units. Do not make claims the seller cannot verify.",
  },
];

export const POLICY_IDS = new Set(POLICY_SECTIONS.map((s) => s.id));

export function getSection(id: string): PolicySection | undefined {
  return POLICY_SECTIONS.find((s) => s.id === id);
}
