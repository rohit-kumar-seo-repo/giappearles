/**
 * GI APPAREL - CENTRALIZED DATA STORE
 * 
 * Developer Note:
 * This file contains all product pricing, collection catalog, and size chart reference tables.
 * Data is derived directly from GI Apparel official pricing and sizing sheets.
 */

// ==========================================
// 1. PRODUCT CATALOG DATA
// ==========================================
const PRODUCTS_DATA = [
  {
    id: "gi-001",
    name: "Alora Midi Dress",
    category: "dresses",
    categoryLabel: "Dresses",
    displayPrice: 1999,
    launchPrice: 1699,
    savings: 300,
    shipping: "Extra",
    image: "assets/images/optimized/alora midi.jpg",
    secondaryImage: "assets/images/optimized/alora midi2.jpg",
    description: "A handcrafted powder blue midi dress in soft textured cotton fabric, with spaghetti straps, a fitted bodice, a gathered skirt and a scalloped embroidered hem.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "LAUNCH SALE",
    rating: 4.9,
    reviewsCount: 28,
    details: [
      "Fabric: Soft Textured Cotton Fabric",
      "Colour: Powder Blue",
      "Design: Spaghetti-Strap Midi Dress",
      "Details: Fitted bodice with gathered skirt and scalloped embroidered hem",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-002",
    name: "Midnight Halter Neck Top",
    category: "tops",
    categoryLabel: "Tops",
    displayPrice: 999,
    launchPrice: 799,
    savings: 200,
    shipping: "Extra",
    image: "assets/images/optimized/midnight halter top1.jpg",
    secondaryImage: "assets/images/optimized/midnight halter top2.jpg",
    additionalImages: ["assets/images/optimized/midnight halter top3.jpg"],
    description: "Sleek and sophisticated midnight black halter neck top crafted with high-grade satin blend. Features a elegant tie-back halter neck for an effortless evening chic aesthetic.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "THE EDIT",
    rating: 4.8,
    reviewsCount: 34,
    details: [
      "Fabric: Luxe Satin Poly-Blend",
      "Neckline: High Halter Neck with Back Tie",
      "Fit: Tailored Regular Fit",
      "Care: Hand wash cold"
    ]
  },
  {
    id: "gi-005",
    name: "Rosie Gingham",
    category: "tops",
    categoryLabel: "Tops",
    displayPrice: 999,
    launchPrice: 799,
    savings: 200,
    shipping: "Extra",
    image: "assets/images/optimized/rosie gingham top1.jpg",
    secondaryImage: "assets/images/optimized/rosie gingham top2.jpg",
    description: "A handcrafted pink and white cotton gingham halter-neck top with a shirred bodice and softly flared peplum hem.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "NEW ARRIVAL",
    rating: 4.9,
    reviewsCount: 22,
    details: [
      "Fabric: Cotton Gingham Fabric",
      "Colour: Pink & White Checks",
      "Design: Halter-Neck Top",
      "Details: Shirred bodice and softly flared peplum hem",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-004",
    name: "Navy Ruched Co-ord Set",
    category: "coords",
    categoryLabel: "Co-ord Sets",
    displayPrice: 1998,
    launchPrice: 1598,
    savings: 400,
    shipping: "Extra",
    isBundle: true,
    image: "assets/images/optimized/1000065964.jpg",
    secondaryImage: "assets/images/optimized/1000067199.jpg",
    description: "A handcrafted deep navy blue halter-neck co-ord set in textured eyelet fabric, featuring a ruched twist-bust detail and fitted silhouette.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "BUNDLE SAVE ₹400",
    rating: 5.0,
    reviewsCount: 42,
    details: [
      "Fabric: Textured Eyelet Fabric",
      "Colour: Deep Navy Blue",
      "Design: Halter-Neck Co-ord Set with Ruched Bust Detail",
      "Details: Ruched/twist bust detail with fitted silhouette",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-008",
    name: "Alora Mini Dress",
    category: "dresses",
    categoryLabel: "Dresses",
    displayPrice: 1999,
    launchPrice: 1699,
    savings: 300,
    shipping: "Extra",
    image: "assets/images/optimized/alora mini2.jpg",
    secondaryImage: "assets/images/optimized/alora mini1.jpg",
    description: "A handcrafted powder blue mini dress in soft textured cotton fabric, with spaghetti straps, a gathered skirt and an embroidered scalloped hem.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "SIGNATURE",
    rating: 4.9,
    reviewsCount: 31,
    details: [
      "Fabric: Soft Textured Cotton Fabric",
      "Colour: Powder Blue",
      "Design: Spaghetti-Strap Mini Dress",
      "Details: Gathered skirt with embroidered scalloped hem",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-009",
    category: "dresses",
    categoryLabel: "Dresses",
    displayPrice: 2199,
    launchPrice: 1899,
    savings: 300,
    shipping: "Extra",
    image: "assets/images/optimized/azure bloom dress1.jpg",
    secondaryImage: "assets/images/optimized/azure bloom dress2.jpg",
    name: "White & Blue Floral Mini Dress",
    description: "A handcrafted mini dress in cotton embroidery fabric, with white fabric, blue floral embroidery, a ruched bust and a gathered flared skirt.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "NEW ARRIVAL",
    rating: 4.9,
    reviewsCount: 27,
    details: [
      "Fabric: Cotton Embroidery Fabric",
      "Colour: White with Blue Floral Embroidery",
      "Design: Spaghetti-Strap Mini Dress",
      "Details: Ruched bust with gathered flared skirt",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-011",
    name: "Azure Mini Skirt",
    category: "bottoms",
    categoryLabel: "Skirts & Shorts",
    displayPrice: 999,
    launchPrice: 799,
    savings: 200,
    shipping: "Extra",
    image: "assets/images/optimized/azure mini skirt1.jpg",
    secondaryImage: "assets/images/optimized/azure mini skirt2.jpg",
    description: "Handcrafted cotton embroidery fabric skorts in white with blue floral embroidery and a floral embroidered finish.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "NEW ARRIVAL",
    rating: 4.8,
    reviewsCount: 18,
    details: [
      "Fabric: Cotton Embroidery Fabric",
      "Colour: White with Blue Floral Embroidery",
      "Design: Skirt",
      "Details: Floral embroidered finish",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-006",
    name: "Rosie Gingham Shorts",
    category: "bottoms",
    categoryLabel: "Skirts & Shorts",
    displayPrice: 999,
    launchPrice: 799,
    savings: 200,
    shipping: "Extra",
    image: "assets/images/optimized/rosie gingham short1.jpg",
    secondaryImage: "assets/images/optimized/rosie gingham short2.jpg",
    description: "Handcrafted pink and white cotton gingham shorts with an elasticated waist and pockets.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "SUMMER ESSENTIAL",
    rating: 4.8,
    reviewsCount: 15,
    details: [
      "Fabric: Cotton Gingham Fabric",
      "Colour: Pink & White",
      "Design: Gingham Shorts",
      "Details: Elasticated waist with pockets",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-012",
    name: "Floral Bubble Halter",
    category: "dresses",
    categoryLabel: "Dresses",
    displayPrice: 1999,
    launchPrice: 1699,
    savings: 300,
    shipping: "Extra",
    image: "assets/images/optimized/floral bubble halter1.jpg",
    secondaryImage: "assets/images/optimized/floral bubble halter2.jpg",
    description: "A handcrafted ivory white floral-print mini dress in cotton rayon, with a halter neckline, fitted bodice and gathered flared skirt.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "NEW ARRIVAL",
    rating: 4.8,
    reviewsCount: 18,
    details: [
      "Fabric: Cotton Rayon",
      "Colour: Ivory White with Floral Print",
      "Design: Halter-Neck Mini Dress",
      "Details: Fitted bodice with gathered, flared skirt",
      "Craftsmanship: Handcrafted"
    ]
  },
  {
    id: "gi-013",
    name: "Gingham Co-ord Set",
    category: "coords",
    categoryLabel: "Co-ord Sets",
    displayPrice: 1998,
    launchPrice: 1598,
    savings: 400,
    shipping: "Extra",
    isBundle: true,
    image: "assets/images/optimized/gingham co-ord set1.jpg",
    secondaryImage: "assets/images/optimized/gingham co-ord set2.jpg",
    description: "A handcrafted pink and white cotton gingham halter-neck romper with a ruched bodice, elasticated waist and flared shorts.",
    sizes: ["XS", "S", "M", "L", "XL"],
    badge: "NEW ARRIVAL",
    rating: 4.8,
    reviewsCount: 18,
    details: [
      "Fabric: Cotton Gingham Fabric",
      "Colour: Pink & White Checks",
      "Design: Halter-Neck Romper",
      "Details: Ruched bodice, elasticated waist and flared shorts",
      "Craftsmanship: Handcrafted"
    ]
  }
];

// ==========================================
// 2. OFFICIAL SIZE CHART TABLES (FROM PDF 1)
// ==========================================
const SIZE_CHART_DATA = {
  // Top / Kurti Sizing
  topKurti: {
    title: "Top & Kurti Size Guide",
    inches: [
      { size: "XS",  bust: "32-34", waist: "28-30", hip: "34-36" },
      { size: "S",   bust: "34-36", waist: "30-32", hip: "36-38" },
      { size: "M",   bust: "36-38", waist: "32-34", hip: "38-40" },
      { size: "L",   bust: "38-40", waist: "34-36", hip: "40-42" },
      { size: "XL",  bust: "40-42", waist: "36-38", hip: "42-44" }
    ],
    cm: [
      { size: "XS",  bust: "81.3-86.4", waist: "71.1-76.2", hip: "86.4-91.4" },
      { size: "S",   bust: "86.4-91.4", waist: "76.2-81.3", hip: "91.4-96.5" },
      { size: "M",   bust: "91.4-96.5", waist: "81.3-86.4", hip: "96.5-101.6" },
      { size: "L",   bust: "96.5-101.6",waist: "86.4-91.4", hip: "101.6-106.7" },
      { size: "XL",  bust: "101.6-106.7",waist:"91.4-96.5", hip: "106.7-111.8" }
    ]
  },

  // Fitting Pant Sizing
  fittingPant: {
    title: "Fitting Pant Size Guide",
    inches: [
      { size: "XS",  waist: "28-30", hip: "36-38", length: "41" },
      { size: "S",   waist: "30-32", hip: "38-40", length: "41" },
      { size: "M",   waist: "32-34", hip: "40-42", length: "41" },
      { size: "L",   waist: "34-36", hip: "42-44", length: "41" },
      { size: "XL",  waist: "36-38", hip: "44-46", length: "41" },
      { size: "XXL", waist: "38-40", hip: "46-48", length: "41" }
    ],
    cm: [
      { size: "XS",  waist: "71.1-76.2", hip: "91.4-96.5", length: "104.1" },
      { size: "S",   waist: "76.2-81.3", hip: "96.5-101.6", length: "104.1" },
      { size: "M",   waist: "81.3-86.4", hip: "101.6-106.7", length: "104.1" },
      { size: "L",   waist: "86.4-91.4", hip: "106.7-111.8", length: "104.1" },
      { size: "XL",  waist: "91.4-96.5", hip: "111.8-116.8", length: "104.1" },
      { size: "XXL", waist: "96.5-101.6", hip: "116.8-121.9", length: "104.1" }
    ]
  },

  // Bottom Skirts / Shorts Sizing
  bottomSkirtsShorts: {
    title: "Skirts & Shorts Size Guide",
    inches: [
      { size: "XS",  waist: "28-30", hip: "36-38", length: "41" },
      { size: "S",   waist: "30-32", hip: "38-40", length: "41" },
      { size: "M",   waist: "32-34", hip: "40-42", length: "41" },
      { size: "L",   waist: "34-36", hip: "42-44", length: "41" },
      { size: "XL",  waist: "36-38", hip: "44-46", length: "41" }
    ],
    cm: [
      { size: "XS",  waist: "71.1-76.2", hip: "91.4-96.5", length: "104.1" },
      { size: "S",   waist: "76.2-81.3", hip: "96.5-101.6", length: "104.1" },
      { size: "M",   waist: "81.3-86.4", hip: "101.6-106.7", length: "104.1" },
      { size: "L",   waist: "86.4-91.4", hip: "106.7-111.8", length: "104.1" },
      { size: "XL",  waist: "91.4-96.5", hip: "111.8-116.8", length: "104.1" }
    ]
  }
};
