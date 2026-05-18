import OpenAI, { toFile } from "openai";
import { Jimp } from "jimp";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 240 * 1000, // 4-minute timeout for intensive gpt-image-2 generations
});

async function formatImageForEdit(
  inputBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> {
  console.log(`DEBUG: Formatting product image to match canvas size ${targetWidth}x${targetHeight}`);
  const image = await Jimp.read(inputBuffer);

  // Create a transparent canvas matching the exact target size
  const canvas = new Jimp({ width: targetWidth, height: targetHeight, color: 0x00000000 });

  // Scale the product image so it fits within the canvas with a nice border
  // For width, keep max 85% of target width. For height, keep max 80% of target height.
  const maxWidth = Math.round(targetWidth * 0.85);
  const maxHeight = Math.round(targetHeight * 0.80);

  let newW = image.width;
  let newH = image.height;

  // Calculate scaling factor to fit within maxWidth/maxHeight without distortion
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  newW = Math.round(image.width * scale);
  newH = Math.round(image.height * scale);

  image.resize({ w: newW, h: newH });

  // Center composite on the transparent canvas
  const x = Math.floor((targetWidth - newW) / 2);
  const y = Math.floor((targetHeight - newH) / 2);
  canvas.composite(image, x, y);

  return canvas.getBuffer("image/png");
}


// Prompt architecture from Golang project (prompts.go)
const BasePrompt = `
UNIVERSAL MASTER PROMPT (MOBILE-FIRST DYNAMIC VERSION)
Create a premium ecommerce landing page section using the uploaded product image as the exact hero product.

IMPORTANT:
Preserve the original: Packaging, Logo, Label details, Product shape, Brand colors, Product proportions.

DYNAMIC CONTEXT:
- Target Language: {language}
- Target Market/Country: {market}
- Target Audience: {audience}
- Product Category: {category}
- Brand Style: Premium Ecommerce
- Platform: Mobile Landing Page

YOUR TASK:
Automatically adapt: Typography, Model ethnicity/features, Fashion styling, Interior/environment, Emotional tone, Advertising aesthetics, UI style, Color harmony, Cultural visual cues, Buying psychology to match the target market and audience.

VISUAL STYLE:
Premium ecommerce advertising, Modern Shopify landing page aesthetic, High-converting direct response design, Luxury commercial photography, Mobile-first composition (9:16). 

COMPOSITION & CONNECTION:
CRITICAL: To ensure all sections feel connected, apply a subtle "Vertical Vignette" effect. The VERY TOP and VERY BOTTOM 8% of the image should transition into a soft, consistent shadow. This ensures that when sections are stacked, they blend seamlessly without being too dark.

BACKGROUND:
Create a professional gradient or environmental background matching the product category. The background must be dark/moody at the top and bottom edges to facilitate the "connected" look.

LIGHTING & QUALITY:
Cinematic "Atmospheric" lighting. Central subject is highlight-lit, while edges are soft and shadowed. 

SHADOW LOGIC:
Use context-aware shadows. Do not always use neutral black/dark shadows. If the product is glass or liquid, use refractive and colored shadows. If the environment is warm, use warm-tinted soft shadows. Match the shadow's color and density to the specific lighting and surface of the environment to ensure the product is grounded naturally.

Ultra realistic, professional art direction, sharp focus, highly detailed.

MODEL DIRECTION:
If people are included, use models representative of the target market, matching the target audience age range, with natural interaction with the product.
`;

const SectionPrompts: Record<string, string> = {
  hero: `
SECTION TYPE: HERO
Create the HERO section for a premium ecommerce landing page.
GOAL: Immediately communicate the product’s main transformation and emotional benefit.
SCENE: Create an aspirational lifestyle scene. The model should naturally interact with the product in a realistic premium advertising style.
LAYOUT: Large product focus, Strong headline area, Premium ecommerce composition, Clear CTA area, Mobile-first structure.
CRITICAL: DO NOT ADD FAKE INTERACTIVE BUTTONS. Natural typography and headlines are allowed, but do not bake clickable-looking buttons into the image.
`,
  benefits: `
SECTION TYPE: BENEFITS
Create a visually premium benefits/features section.
GOAL: Clearly communicate the product’s key advantages in a highly scannable ecommerce format.
SCENE: Display the product with visual elements related to ingredients, materials, technology, or lifestyle usage.
INCLUDE: 3–6 benefit blocks, Icons or visual indicators, Modern infographic-style layout.
`,
  social_proof: `
SECTION TYPE: TESTIMONIALS / SOCIAL PROOF
Create a premium testimonials/reviews section.
GOAL: Increase trust and social proof.
SCENE: Display realistic happy customers matching the target audience demographics.
INCLUDE: Review cards, Profile photos, Star ratings, Ecommerce UI elements, Authentic user-generated-content feel.
`,
  how_it_works: `
SECTION TYPE: HOW IT WORKS
Create a clean visually engaging process section.
GOAL: Explain how the product works in a simple highly visual way.
SCENE: Create a premium infographic layout showing 3 simple steps and product interaction.
`,
  urgency: `
SECTION TYPE: BEFORE & AFTER / TRANSFORMATION
Create a premium transformation/comparison section.
GOAL: Visually demonstrate the product’s impact.
SCENE: Create a split-screen composition showing BEFORE (problem) and AFTER (improvement). The uploaded product should appear prominently.
`,
  guarantee: `
SECTION TYPE: TRUST / QUALITY / GUARANTEE
Create a premium trust-building section.
GOAL: Increase perceived product quality and legitimacy.
SCENE: Display the product in a luxury studio environment with trust badges and premium packaging presentation.
`,
  cta_footer: `
SECTION TYPE: FINAL CTA
Create the final high-converting CTA section.
GOAL: Maximize purchase intent and emotional conversion.
SCENE: Large premium product shot with emotionally compelling lifestyle atmosphere.
CRITICAL: DO NOT ADD FAKE INTERACTIVE BUTTONS. Natural typography and headlines are allowed, but do not bake clickable-looking buttons into the image.
`,
  problem: `
SECTION TYPE: PROBLEM IDENTIFICATION
GOAL: Agitate the pain point that the product solves.
SCENE: Moody environmental scene showing the frustration of the target audience without the product.
`,
  solution: `
SECTION TYPE: SOLUTION REVEAL
GOAL: Present the product as the ultimate relief.
SCENE: Bright, high-energy scene where the product is introduced as the hero of the day.
CRITICAL: DO NOT ADD FAKE INTERACTIVE BUTTONS. Natural typography and headlines are allowed, but do not bake clickable-looking buttons into the image.
`,
  faq: `
SECTION TYPE: FAQ
GOAL: Resolve last-minute objections.
SCENE: Clean, minimalist trust-focused layout with the product visible in a supportive role.
`,
};

export function BuildPrompt(
  sectionType: string,
  language: string,
  market: string,
  audience: string,
  category: string
) {
  const sectionBase = SectionPrompts[sectionType] || `SECTION TYPE: ${sectionType.toUpperCase()}\nCreate a professional landing page section for the product.`;
  const header = BasePrompt
    .replace("{language}", language)
    .replace("{market}", market)
    .replace("{audience}", audience)
    .replace("{category}", category);
  return header + "\n" + sectionBase;
}

export async function generatePrompt(
  customPrompt: string,
  sectionType: string,
  language: string,
  market: string,
  audience: string,
  productCategory: string
): Promise<string> {
  const finalPrompt = BuildPrompt(sectionType, language, market, audience, productCategory);
  if (customPrompt && customPrompt.trim()) {
    return `${finalPrompt}\n\nUSER CUSTOM INSTRUCTION: ${customPrompt}`;
  }
  return finalPrompt;
}

function extractImageResult(data: Array<{ url?: string | null; b64_json?: string | null }>): string {
  const item = data[0];
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("No image data in response");
}

export async function generateImage(
  prompt: string,
  highQuality: boolean = false,
  productImageUrl?: string,
  modelImageUrl?: string
): Promise<string> {
  const imageUrl = productImageUrl || modelImageUrl;
  const hasImage = imageUrl && imageUrl !== "null" && imageUrl !== "undefined";

  // Force quality strictly to 'medium' and resolution to '1024x1536' to lock the generation cost at exactly $0.04!
  const quality = "medium";
  const sizeStr = "1024x1536";

  try {
    if (hasImage) {
      console.log(`DEBUG: gpt-image-2 edit — base image: ${imageUrl}`);

      let imageResponse;
      try {
        imageResponse = await fetch(imageUrl.trim(), {
          signal: AbortSignal.timeout(15000),
        });
      } catch (fetchErr: any) {
        throw new Error(`Failed to download product image for editing: ${fetchErr.message}`);
      }

      if (!imageResponse.ok) {
        throw new Error(`Product image CDN returned HTTP ${imageResponse.status} Access Denied`);
      }

      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      
      const [tWidth, tHeight] = sizeStr.split("x").map(Number);

      // Auto-format product image to be perfectly sized inside a transparent RGBA PNG canvas
      const formattedBuffer = await formatImageForEdit(buffer, tWidth || 1024, tHeight || 1536);
      const imageFile = await toFile(formattedBuffer, "product.png", { type: "image/png" });

      console.log("DEBUG: Calling OpenAI Image Edit (gpt-image-2) with formatted base image");
      const response = await openai.images.edit({
        model: "gpt-image-2",
        image: imageFile,
        prompt: prompt || "Keep product packaging identical. Set on a high-end commercial studio shelf with premium lighting, soft professional shadows",
        size: sizeStr,
        quality,
      } as any);

      if (!response.data?.length) throw new Error("Empty response from gpt-image-2 edit");
      return extractImageResult(response.data);
    } else {
      console.log("DEBUG: gpt-image-2 generation from scratch");

      const response = await openai.images.generate({
        model: "gpt-image-2",
        prompt,
        n: 1,
        size: sizeStr,
        quality,
      } as any);

      if (!response.data?.length) throw new Error("Empty response from gpt-image-2 generate");
      return extractImageResult(response.data);
    }
  } catch (error: any) {
    console.error("OpenAI Execution Error:", error);
    throw new Error(error.message || "Failed to execute OpenAI image task");
  }
}
