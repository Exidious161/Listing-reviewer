import type { Listing } from "./types";

/** Demo batch: a mix of clean listings and deliberately problematic ones. */
export const SAMPLE_LISTINGS: Partial<Listing>[] = [
  {
    title: "Insulated Stainless Steel Water Bottle 750ml",
    description:
      "Double-wall stainless steel bottle, 750ml capacity, leak-proof lid, dishwasher-safe body. New condition. Includes carry loop.",
    category: "Home & Kitchen",
    price: "24.99",
    attributes: { material: "stainless steel", capacity: "750ml" },
    seller: "AquaGear",
    tags: ["bottle", "insulated"],
  },
  {
    title: "BEST Water Bottle EVER!!! Unbeatable Price",
    description:
      "Amazing must-have bottle with lifetime warranty and 100% safe materials. Works for everyone. Call me 9876543210 for a secret discount.",
    category: "Home & Kitchen",
    price: "$19.99",
    attributes: {},
    seller: "QuickDeals",
    tags: ["bottle", "cheap", "best", "sale", "new", "hot", "deal", "water", "steel", "cool"],
  },
  {
    title: "Replica Designer Handbag 1:1 Copy of Famous Brand",
    description:
      "High quality replica handbag with the famous brand logo. Looks identical to the original. Ships worldwide.",
    category: "Clothing & Accessories",
    price: "89",
    attributes: { colour: "black" },
    seller: "LuxeForLess",
    tags: ["handbag"],
  },
  {
    title: "Herbal Wellness Tonic 500ml",
    description:
      "Our tonic cures anxiety, treats diabetes and prevents cancer. Doctor recommended. Guaranteed results in 7 days.",
    category: "Beauty & Personal Care",
    price: "45.00",
    attributes: { volume: "500ml" },
    seller: "NaturePure",
    tags: ["tonic"],
  },
  {
    title: "Wireless Bluetooth Earbuds",
    description:
      "Earbuds with charging case. Works with most devices. Used.",
    category: "Electronics",
    price: "1,499.00",
    attributes: { colour: "white" },
    seller: "SoundHub",
    tags: ["earbuds"],
  },
  {
    title: "Logo Design Service",
    description:
      "I will design your logo and guarantee your business will get 10x more customers and top Google ranking within a month.",
    category: "Services",
    price: "contact me",
    attributes: {},
    seller: "PixelCraft",
    tags: ["logo"],
  },
  {
    title: "Insulated Stainless Steel Water Bottle 750ml",
    description:
      "Double-wall stainless steel bottle, 750ml capacity, leak-proof lid, dishwasher-safe body. New condition. Includes carry loop.",
    category: "Home & Kitchen",
    price: "24.99",
    attributes: { material: "stainless steel" },
    seller: "AquaGear",
    tags: ["bottle"],
  },
  {
    title: "Hunting Ammunition Bundle",
    description: "Bulk ammunition and firearm parts for sale, discreet shipping.",
    category: "Firearms",
    price: "300",
    attributes: {},
    seller: "OutdoorArms",
    tags: [],
  },
];
