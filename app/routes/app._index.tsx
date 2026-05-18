import { useEffect, useState, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  TextField,
  Select,
  InlineStack,
  Grid,
  Spinner,
  Banner,
  Thumbnail,
  Badge,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { generatePrompt, generateImage, openai } from "../lib/openai.server";
import prisma from "../db.server";

// Interfaces
interface Product {
  id: string;
  title: string;
  handle: string;
  featuredImage?: {
    url: string;
  } | null;
}

const ALL_SECTIONS = [
  { key: "hero", label: "Hero Banner", icon: "🎯" },
  { key: "problem", label: "Pain Point", icon: "⚡" },
  { key: "solution", label: "Solution Reveal", icon: "✨" },
  { key: "benefits", label: "Key Benefits", icon: "🏆" },
  { key: "social_proof", label: "Social Proof", icon: "⭐" },
  { key: "how_it_works", label: "How It Works", icon: "🔄" },
  { key: "urgency", label: "Before & After", icon: "🔥" },
  { key: "guarantee", label: "Guarantee", icon: "🛡️" },
  { key: "cta_footer", label: "Final CTA", icon: "💥" },
  { key: "faq", label: "FAQ", icon: "❓" },
  { key: "cod_form", label: "COD Form / App Block", icon: "📝" },
];

// Mock products for fallback if store has none
const MOCK_PRODUCTS: Product[] = [
  { id: "demo-1", title: "Luxury Perfume Spray (Demo)", handle: "demo-1", featuredImage: { url: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=150" } },
  { id: "demo-2", title: "Hydrating Facial Serum (Demo)", handle: "demo-2", featuredImage: { url: "https://images.unsplash.com/photo-1608248597481-496100c8c836?w=150" } },
  { id: "demo-3", title: "Ultra Chronograph Watch (Demo)", handle: "demo-3", featuredImage: { url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=150" } }
];

// Compile generated Landing Page details to a responsive, fully-designed HTML output
const generateLPHTML = (copy: any, images: Record<string, string>, theme: any, sectionsOrder: string[] = ["hero", "benefits", "cta_footer"]) => {
  const primary = theme.primary || "#6366F1";
  const bg = theme.background || "#F9FAFB";
  const text = theme.text || "#111827";
  const isRTL = theme.language === "Arabic" || theme.language === "ar";
  const dir = isRTL ? "rtl" : "ltr";
  const textAlign = isRTL ? "right" : "left";
  const fontStack = isRTL 
    ? "Cairo, 'Noto Sans Arabic', -apple-system, sans-serif" 
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  // Mode 1: Seamless Visual Mode (Images only, zero-gap stack, hides theme header & footer)
  if (theme.publishMode === "visual_only") {
    const imageElements = sectionsOrder
      .filter(key => !!images[key] || key === "cod_form")
      .map(key => {
        if (key === "cod_form") {
          return `<div style="background-color: ${theme.codBgColor || '#FFFFFF'} !important; padding: 20px 0 !important; width: 100% !important; box-sizing: border-box !important; display: block !important;">
            ${theme.codEmbed || ""}
          </div>`;
        }
        return `<img src="${images[key]}" alt="${key} section" style="width: 100% !important; height: auto !important; display: block !important; margin: 0 !important; padding: 0 !important; border: none !important;" />`;
      })
      .join("\n");

    return `
      <style>
      /* Hide standard theme headers, footers, announcement bars, and navigation */
      header, footer, 
      .site-header, .site-footer, 
      .header-wrapper, .footer-wrapper,
      #shopify-section-header, #shopify-section-footer,
      #shopify-section-announcement-bar, [id*="announcement-bar"],
      [id*="header"], [id*="footer"],
      .announcement-bar, .site-nav, .navigation, 
      .breadcrumbs, .page-header, .main-header, .main-footer,
      #shopify-section-sections--header, #shopify-section-sections--footer,
      .main-page-title, .page-title, h1.page-title, h1.main-page-title, .page-title-wrapper, .page-header h1 {
        display: none !important;
        height: 0 !important;
        visibility: hidden !important;
        opacity: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /* Span 100% full-screen without side-margins or padding */
      main, #MainContent, #main-content, .main-content,
      .page-width, .shopify-section, .page-container, .wrapper,
      [class*="page-width"], [class*="main-content"], .shopify-policy__container {
        max-width: none !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Reset body margins */
      body, html {
        margin: 0 !important;
        padding: 0 !important;
        overflow-x: hidden !important;
      }

      .pageforge-visual-lander {
        width: 100% !important;
        max-width: 640px !important; /* Premium mobile focus width */
        margin: 0 auto !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        background: #000000 !important;
        box-shadow: 0 4px 30px rgba(0,0,0,0.1) !important;
      }

      .pageforge-visual-lander img {
        width: 100% !important;
        height: auto !important;
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }
      </style>

      <div class="pageforge-visual-lander">
        ${imageElements}
      </div>
    `;
  }

  // Mode 2: Standard Hybrid Layout
  return `
    ${isRTL ? `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
    ` : ''}
    <div dir="${dir}" style="font-family: ${fontStack}; background-color: ${bg}; color: ${text}; padding: 0; margin: 0; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; box-shadow: 0 4px 20px rgba(0,0,0,0.05); text-align: ${textAlign};">
      <!-- Hero -->
      ${copy.hero?.headline ? `
      <div style="text-align: center; padding: 50px 20px; background: linear-gradient(180deg, #111827 0%, #1e1e2f 100%); color: white;">
        <h1 style="font-size: 2rem; font-weight: 800; margin: 0 0 16px 0; color: #ffffff; line-height: 1.2;">${copy.hero.headline}</h1>
        <p style="font-size: 1.05rem; color: #a5a6c5; max-width: 450px; margin: 0 auto 24px auto;">${copy.hero.subheadline}</p>
        ${images.hero ? `<img src="${images.hero}" style="width: 100%; border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,0.3); margin-bottom: 24px; max-height: 480px; object-fit: cover;" />` : ''}
        <div>
          <a href="#" style="background-color: ${primary}; color: white; padding: 12px 28px; font-weight: bold; border-radius: 6px; text-decoration: none; display: inline-block; box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3); font-size: 1rem;">${copy.hero.ctaText}</a>
        </div>
      </div>` : ''}

      <!-- Problem Identification -->
      ${copy.problem?.headline ? `
      <div style="padding: 40px 20px; text-align: center; border-bottom: 1px solid #E5E7EB;">
        <h2 style="font-size: 1.6rem; font-weight: 700; color: #EF4444; margin: 0 0 12px 0;">${copy.problem.headline}</h2>
        <p style="font-size: 1rem; color: #4B5563; max-width: 450px; margin: 0 auto;">${copy.problem.description}</p>
        ${images.problem ? `<img src="${images.problem}" style="width: 100%; border-radius: 8px; margin-top: 20px; max-height: 320px; object-fit: cover;" />` : ''}
      </div>` : ''}

      <!-- Solution Reveal -->
      ${copy.solution?.headline ? `
      <div style="background-color: white; padding: 45px 20px; text-align: center; border-bottom: 1px solid #E5E7EB;">
        <h2 style="font-size: 1.6rem; font-weight: 700; color: ${primary}; margin: 0 0 12px 0;">${copy.solution.headline}</h2>
        <p style="font-size: 1rem; color: #4B5563; max-width: 450px; margin: 0 auto 24px auto;">${copy.solution.description}</p>
        ${images.solution ? `<img src="${images.solution}" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); max-height: 380px; object-fit: cover; margin-bottom: 24px;" />` : ''}
        <div>
          <a href="#" style="background-color: ${primary}; color: white; padding: 12px 28px; font-weight: bold; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 1rem;">${copy.solution.ctaText || 'Buy Now'}</a>
        </div>
      </div>` : ''}

      <!-- Benefits -->
      ${copy.benefits?.title ? `
      <div style="padding: 40px 20px; border-bottom: 1px solid #E5E7EB;">
        <h2 style="font-size: 1.6rem; font-weight: 700; text-align: center; margin: 0 0 28px 0;">${copy.benefits.title}</h2>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${copy.benefits.items?.map((item: any, idx: number) => `
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #E5E7EB; display: flex; align-items: flex-start; gap: 12px; direction: ${dir}; text-align: ${textAlign};">
              <div style="background-color: rgba(99, 102, 241, 0.1); color: ${primary}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">${idx + 1}</div>
              <div>
                <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0 0 4px 0; color: ${text};">${item.title}</h3>
                <p style="color: #6B7280; font-size: 0.95rem; margin: 0;">${item.description}</p>
              </div>
            </div>
          `).join('')}
        </div>
        ${images.benefits ? `<div style="text-align: center; margin-top: 24px;"><img src="${images.benefits}" style="width: 100%; border-radius: 8px; max-height: 300px; object-fit: cover;" /></div>` : ''}
      </div>` : ''}

      <!-- How it Works -->
      ${copy.howItWorks?.title ? `
      <div style="background-color: white; padding: 40px 20px; border-bottom: 1px solid #E5E7EB;">
        <h2 style="font-size: 1.6rem; font-weight: 700; text-align: center; margin: 0 0 28px 0;">${copy.howItWorks.title}</h2>
        <div style="display: flex; flex-direction: column; gap: 20px;">
          ${copy.howItWorks.steps?.map((step: any, idx: number) => `
            <div style="display: flex; align-items: flex-start; gap: 12px; direction: ${dir}; text-align: ${textAlign};">
              <div style="background-color: ${primary}; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 0.9rem;">${idx + 1}</div>
              <div>
                <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0 0 4px 0; color: ${text};">${step.title}</h3>
                <p style="color: #6B7280; font-size: 0.95rem; margin: 0;">${step.description}</p>
              </div>
            </div>
          `).join('')}
        </div>
        ${images.howItWorks ? `<div style="text-align: center; margin-top: 24px;"><img src="${images.howItWorks}" style="width: 100%; border-radius: 8px; max-height: 300px; object-fit: cover;" /></div>` : ''}
      </div>` : ''}

      <!-- Testimonials / Social Proof -->
      ${copy.socialProof?.title ? `
      <div style="padding: 40px 20px; border-bottom: 1px solid #E5E7EB;">
        <h2 style="font-size: 1.6rem; font-weight: 700; text-align: center; margin: 0 0 28px 0;">${copy.socialProof.title}</h2>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${copy.socialProof.testimonials?.map((t: any) => `
            <div style="background: white; padding: 18px; border-radius: 8px; border: 1px solid #E5E7EB; direction: ${dir}; text-align: ${textAlign};">
              <div style="color: #FBBF24; font-size: 1rem; margin-bottom: 8px;">${'★'.repeat(t.rating || 5)}</div>
              <p style="color: #4B5563; font-style: italic; font-size: 0.95rem; margin: 0 0 10px 0;">"${t.text}"</p>
              <div style="font-weight: bold; font-size: 0.9rem; color: ${text};">${t.name}</div>
            </div>
          `).join('')}
        </div>
        ${images.socialProof ? `<div style="text-align: center; margin-top: 24px;"><img src="${images.socialProof}" style="width: 100%; border-radius: 8px; max-height: 300px; object-fit: cover;" /></div>` : ''}
      </div>` : ''}

      <!-- Trust / Guarantee -->
      ${copy.guarantee?.headline ? `
      <div style="background-color: white; padding: 40px 20px; border-bottom: 1px solid #E5E7EB; text-align: center;">
        <div style="border: 2px dashed ${primary}; padding: 24px; border-radius: 8px; background-color: rgba(99, 102, 241, 0.01); direction: ${dir}; text-align: ${textAlign === 'left' ? 'center' : textAlign};">
          <h2 style="font-size: 1.35rem; font-weight: 700; color: ${primary}; margin: 0 0 8px 0;">🏆 ${copy.guarantee.headline}</h2>
          <p style="color: #4B5563; font-size: 0.95rem; line-height: 1.5; margin: 0;">${copy.guarantee.description}</p>
          ${images.guarantee ? `<img src="${images.guarantee}" style="max-width: 120px; margin-top: 16px;" />` : ''}
        </div>
      </div>` : ''}

      <!-- FAQ Accordions -->
      ${copy.faq?.title ? `
      <div style="padding: 40px 20px; border-bottom: 1px solid #E5E7EB;">
        <h2 style="font-size: 1.6rem; font-weight: 700; text-align: center; margin: 0 0 28px 0;">${copy.faq.title}</h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${copy.faq.items?.map((item: any) => `
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #E5E7EB; direction: ${dir}; text-align: ${textAlign};">
              <h3 style="font-size: 1rem; font-weight: 700; margin: 0 0 6px 0; color: ${text};">❓ ${item.question}</h3>
              <p style="color: #6B7280; margin: 0; font-size: 0.95rem; line-height: 1.4;">${item.answer}</p>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      <!-- Urgency -->
      ${copy.urgency?.headline ? `
      <div style="background-color: white; padding: 40px 20px; text-align: center; border-bottom: 1px solid #E5E7EB;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #D97706; margin: 0 0 8px 0;">⏳ ${copy.urgency.headline}</h2>
        <p style="font-size: 0.95rem; color: #4B5563; max-width: 400px; margin: 0 auto 20px auto;">${copy.urgency.description}</p>
        ${images.urgency ? `<img src="${images.urgency}" style="width: 100%; border-radius: 8px; max-height: 280px; object-fit: cover; margin-bottom: 20px;" />` : ''}
        <div>
          <a href="#" style="background-color: #D97706; color: white; padding: 12px 28px; font-weight: bold; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 1rem;">${copy.urgency.ctaText}</a>
        </div>
      </div>` : ''}

      <!-- Final CTA Footer -->
      ${copy.ctaFooter?.headline ? `
      <div style="text-align: center; padding: 60px 20px; background: linear-gradient(0deg, #111827 0%, #1e1e2f 100%); color: white;">
        <h2 style="font-size: 1.8rem; font-weight: 800; margin: 0 0 8px 0; color: #ffffff;">${copy.ctaFooter.headline}</h2>
        <p style="font-size: 1rem; color: #a5a6c5; max-width: 400px; margin: 0 auto 24px auto;">${copy.ctaFooter.subheadline}</p>
        ${images.ctaFooter ? `<img src="${images.ctaFooter}" style="width: 100%; border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,0.3); margin-bottom: 24px; max-height: 320px; object-fit: cover;" />` : ''}
        <div>
          <a href="#" style="background-color: ${primary}; color: white; padding: 12px 28px; font-weight: bold; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 1rem;">${copy.ctaFooter.ctaText}</a>
        </div>
      </div>` : ''}
    </div>
  `;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let storeProducts: Product[] = [];
  let installedApps: string[] = [];

  // 1. Fetch store products safely (will always succeed with standard scopes)
  try {
    const response = await admin.graphql(`
      query {
        products(first: 50) {
          nodes {
            id
            title
            handle
            featuredImage {
              url
            }
          }
        }
      }
    `);
    const json = await response.json();
    storeProducts = json?.data?.products?.nodes || [];
  } catch (error) {
    console.error("Failed to fetch Shopify products:", error);
  }

  // 2. Fetch installed apps in a separate, isolated block
  // If the appInstallations query is restricted due to app scopes, it will catch and fail silently.
  try {
    const response = await admin.graphql(`
      query {
        appInstallations(first: 50) {
          nodes {
            app {
              title
            }
          }
        }
      }
    `);
    const json = await response.json();
    installedApps = json?.data?.appInstallations?.nodes?.map((n: any) => n?.app?.title || "") || [];
  } catch (error) {
    // Fail silently on restricted scope permissions to prevent blocking loader execution
  }

  return {
    products: storeProducts.length > 0 ? storeProducts : MOCK_PRODUCTS,
    isDemo: storeProducts.length === 0,
    shopDomain,
    installedApps
  };
};

// Helper to perform the two-stage Shopify file upload (stagedUploadsCreate -> GCS POST -> fileCreate permanent registration)
async function uploadImageToShopify(admin: any, filename: string, mimeType: string, fileBuffer: Buffer) {
  // Stage 1: Request Staged Upload targets
  const stagedResponse = await admin.graphql(`
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      input: [
        {
          filename,
          mimeType,
          resource: "IMAGE",
          fileSize: fileBuffer.length.toString(),
          httpMethod: "POST"
        }
      ]
    }
  });

  const stagedJson = await stagedResponse.json();
  const errors = stagedJson?.data?.stagedUploadsCreate?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(`Staged upload request failed: ${errors[0].message}`);
  }

  const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    throw new Error("No staged targets returned from Shopify API.");
  }

  // Stage 2: Post binary data directly to Shopify's CDN storage bucket via GCS Signed parameters
  const uploadFormData = new FormData();
  for (const param of target.parameters) {
    uploadFormData.append(param.name, param.value);
  }
  // Convert pooled Node Buffer to an isolated Uint8Array view to satisfy TypeScript and prevent GCS upload size mismatch
  const cleanArray = new Uint8Array(
    fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)
  );
  const blob = new Blob([cleanArray as any], { type: mimeType });
  uploadFormData.append("file", blob, filename);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: uploadFormData
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Failed to upload to staged CDN bucket: ${errorText}`);
  }

  // Stage 3: Register the uploaded CDN asset permanently in Shopify Files
  const fileCreateResponse = await admin.graphql(`
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          ... on MediaImage {
            id
            image {
              url
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      files: [
        {
          originalSource: target.resourceUrl,
          contentType: "IMAGE",
          alt: "AI Uploaded Base Image"
        }
      ]
    }
  });

  const fileCreateJson = await fileCreateResponse.json();
  const fileErrors = fileCreateJson?.data?.fileCreate?.userErrors || [];
  if (fileErrors.length > 0) {
    throw new Error(`File registration failed: ${fileErrors[0].message}`);
  }

  const mediaImage = fileCreateJson?.data?.fileCreate?.files?.[0];
  const mediaId = mediaImage?.id;
  let permanentUrl = mediaImage?.image?.url;

  // Poll for ready state as Shopify processes the uploaded file asynchronously
  if (!permanentUrl && mediaId) {
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const pollResponse = await admin.graphql(`
        query getFile($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              status
              image {
                url
              }
            }
          }
        }
      `, {
        variables: { id: mediaId }
      });

      const pollJson = await pollResponse.json();
      const node = pollJson?.data?.node;
      if (node?.status === "READY" && node?.image?.url) {
        permanentUrl = node.image.url;
        break;
      }
    }
  }

  return permanentUrl || target.resourceUrl; // fallback to staged resource URL if polling delays
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "upload_image") {
    const base64Data = formData.get("base64Data") as string;
    const filename = formData.get("filename") as string || "uploaded_product.png";

    try {
      const match = base64Data.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,(.+)$/);
      if (!match) {
        return { success: false, error: "Invalid image data format." };
      }
      const mimeType = match[1];
      const base64Content = match[2];
      const fileBuffer = Buffer.from(base64Content, "base64");

      const permanentUrl = await uploadImageToShopify(admin, filename, mimeType, fileBuffer);
      return { success: true, uploadedImageUrl: permanentUrl };
    } catch (error: any) {
      console.error("Shopify staged upload error:", error);
      return { success: false, error: error.message || "Failed to upload image to Shopify." };
    }
  }

  if (intent === "generate") {
    const customPrompt = formData.get("customPrompt") as string;
    const sectionType = formData.get("sectionType") as string;
    const language = formData.get("language") as string;
    const market = formData.get("market") as string;
    const audience = formData.get("audience") as string;
    const productCategory = formData.get("productCategory") as string;
    const highQuality = formData.get("highQuality") === "true";
    const productImageUrl = formData.get("productImageUrl") as string || "";

    // Create job record immediately and return — actual generation runs in background
    // This keeps the HTTP response under Cloudflare's 100-second tunnel timeout
    const job = await prisma.imageJob.create({ data: { status: "pending" } });

    setImmediate(async () => {
      try {
        await prisma.imageJob.update({ where: { id: job.id }, data: { status: "processing" } });

        const distilledPrompt = await generatePrompt(
          customPrompt, sectionType, language, market, audience, productCategory
        );

        let imageUrl = await generateImage(distilledPrompt, highQuality, productImageUrl);

        if (imageUrl.startsWith("data:")) {
          const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1];
            const fileBuffer = Buffer.from(match[2], "base64");
            const ext = mimeType.split("/")[1] || "png";
            imageUrl = await uploadImageToShopify(admin, `ai-generated-${Date.now()}.${ext}`, mimeType, fileBuffer);
          }
        }

        await prisma.imageJob.update({ where: { id: job.id }, data: { status: "done", imageUrl } });
      } catch (err: any) {
        await prisma.imageJob.update({ where: { id: job.id }, data: { status: "error", error: err.message } });
      }
    });

    return { success: true, jobId: job.id, status: "pending" };
  }

  if (intent === "check_job") {
    const jobId = formData.get("jobId") as string;
    const job = await prisma.imageJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: "Job not found" };
    if (job.status === "done") {
      // Delete completed job to keep DB clean
      await prisma.imageJob.delete({ where: { id: jobId } }).catch(() => { });
      return { success: true, imageUrl: job.imageUrl, jobId };
    }
    if (job.status === "error") {
      await prisma.imageJob.delete({ where: { id: jobId } }).catch(() => { });
      return { success: true, status: "error", error: job.error || "Generation failed", jobId };
    }
    return { success: true, status: job.status, jobId };
  }

  if (intent === "generate_copy") {
    const productTitle = formData.get("productTitle") as string;
    const productDescription = formData.get("productDescription") as string;
    const language = formData.get("language") as string;
    const dialect = formData.get("dialect") as string || "Standard";
    const market = formData.get("market") as string;
    const audience = formData.get("audience") as string;
    const category = formData.get("category") as string;
 
    const tone = formData.get("tone") as string || "aggressive";
    const platform = formData.get("platform") as string || "meta";
    const goal = formData.get("goal") as string || "conversions";
    const showFreeDelivery = formData.get("showFreeDelivery") === "true";
    const showCTA = formData.get("showCTA") === "true";
    const ctaText = formData.get("ctaText") as string || "Shop Now";
 
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an elite conversion rate optimization (CRO) copywriter, expert visual prompt designer, and localization strategist.
Generate a high-converting multi-section landing page in JSON format for the selected product.
 
STRATEGIC DIRECTIVES (Campaign Builder Rules):
- Strategy Platform: ${platform.toUpperCase()} (optimize copy structure and visual instructions specifically for mobile-first ${platform} feed conversions)
- Brand Tone: ${tone} (strictly craft all copywriting lines to fit a highly persuasive "${tone}" marketing tone)
- Campaign Goal: ${goal} (tailor conversion hooks, call-to-actions, and pain-points for "${goal}" performance)
- Action Visual Rules: ${showFreeDelivery ? 'Highlight "Free Express Delivery" or "Zero Shipping Cost" incentives' : ''}. ${showCTA ? `Prominent action button text: "${ctaText}"` : ''}
 
PRODUCT CONTEXT:
- Name: ${productTitle}
- Description: ${productDescription}
- Category: ${category}
- Target Language: ${language}
- Target Market / Country: ${market}
- Target Dialect / Style: ${dialect}
- Target Audience: ${audience}
 
LANGUAGE & LOCALIZATION RULES (Non-Negotiable):
- Write ALL generated output copy values in: ${language}
- The written style and dialect MUST be strictly in: ${dialect}
- Adapt idioms, expressions, and cultural references directly to the target country (${market}) and chosen dialect (${dialect}). Do NOT use literal translations.
- For Arabic specifically:
  * If "Moroccan Darija" is selected: write all generated copy (headlines, benefits, hooks, testimonials) in authentic Moroccan Darija (الدارجة المغربية) with natural Moroccan phrasing and vocabulary (e.g. use "بزاف", "دابا", "زوين", "شنو", "باش" where appropriate) that directly connects with Moroccan buyers.
  * If "Algerian Darija" is selected: write all generated copy in authentic Algerian Darija (الدارجة الجزائرية) with natural Algerian phrasing and vocabulary (e.g. use "بزاف", "درك", "شباب", "واش", "باش" where appropriate) that directly connects with Algerian buyers.
  * If "Tunisian Darija" is selected: write all generated copy in authentic Tunisian Darija (الدارجة تونسية) with natural Tunisian phrasing and vocabulary (e.g. use "برشا", "توة", "مزيان", "شنوة", "باش" where appropriate) that directly connects with Tunisian buyers.
  * If "Standard" or Modern Standard Arabic is selected: Use Modern Standard Arabic (MSA - الفصحى المبسطة) that is warm, conversational, and universally clear.
- For French specifically:
  * If "North African French" is selected: use French written style typical for premium Maghreb audiences, incorporating warm, highly localized French phrasing suitable for Morocco, Algeria, or Tunisia.
  * If "Standard" is selected: Use standard high-converting European French.
- Urgency hooks must feel highly natural to native speakers (e.g., "عرض محدود للغاية", "التوصيل مجاني والدفع عند الاستلام").
- Testimonial names must be highly authentic and common names in the target country (${market}). For Morocco, Algeria, or Tunisia, use highly authentic local names (e.g., Yassine, Amine, Meriem, Anis, Yasmine, Sonia, Bilal, Khadija).
- CTAs must feel natural (e.g., "احصل عليه الآن" not "اضغط هنا").

UNIVERSAL IMAGE PROMPT GENERATION RULES (Inject into every generated "visualPrompt" value):
Generate a detailed image prompt targeting DALL-E/GPT image editing models following these rules:
1. MOBILE-FIRST COMPOSITION: Optimized for vertical smartphone screens (9:16 aspect ratio).
2. PRODUCT PRESERVATION: Instruct to preserve the original packaging, logo, labels, brand colors, and proportions exactly. Only change the background, environment, and lighting. Do NOT modify the product itself.
3. VERTICAL VIGNETTE & CONNECTION: The VERY TOP and VERY BOTTOM 8% of the image must transition into a soft, consistent shadow so stacked sections blend seamlessly.
4. LIGHTING: Cinematic "Atmospheric" lighting with central subject highlighted and soft shadowed edges.
5. SHADOW LOGIC: Context-aware shadows. If the product is glass or liquid, use refractive and colored shadows. Match shadow color and density to the specific lighting and surface.
6. MODEL DIRECTION: If models are included, use models representative of the target market/demographic.

SPECIFIC SECTION IMAGE PROMPT GUIDELINES:
- hero: An aspirational lifestyle scene where the model naturally interacts with the product. Large product focus. DO NOT bake clickable interactive buttons into the image.
- benefits: Visually premium infographic-style layout showcasing product with visual indicators related to ingredients, materials, or lifestyle usage.
- socialProof: Trust-building testimonials setup with realistic happy customers matching target demographics.
- howItWorks: Engaging 3-step process infographic layout with product visible in a supportive role.
- problem: Moody, high-contrast dark visual agitating the core frustration or pain point.
- solution: Bright, highlight-lit visual presenting the product as the ultimate relief and heroic solution. DO NOT bake interactive buttons into the image.
- urgency: Dynamic split-screen comparison showing BEFORE (problem) and AFTER (improvement) with the product appearing prominently.
- guarantee: Premium trust-building layout with product in a luxury studio environment with trust badges and premium packaging.
- faq: Clean, minimalist trust-focused studio photography layout.
- ctaFooter: Final high-converting, large premium product shot with emotionally compelling lifestyle atmosphere. DO NOT bake interactive buttons into the image.

Return ONLY a valid JSON object matching the following structure:
{
  "hero": {
    "headline": "A short, extremely powerful benefit-driven headline",
    "subheadline": "Compelling subheadline detailing results",
    "ctaText": "Urgent Call To Action button text",
    "visualPrompt": "Detailed photographic prompt for the background of the hero product (keep packaging original, place in a premium dynamic scenario)"
  },
  "benefits": {
    "title": "Benefits Section Title",
    "items": [
      { "title": "Benefit 1 Short Title", "description": "Compelling benefit description" },
      { "title": "Benefit 2 Short Title", "description": "Compelling benefit description" },
      { "title": "Benefit 3 Short Title", "description": "Compelling benefit description" }
    ],
    "visualPrompt": "Photographic prompt for the benefits section showing ingredients or dynamic elements"
  },
  "socialProof": {
    "title": "Trust Section Title",
    "testimonials": [
      { "name": "Reviewer Name 1", "text": "Ultra-persuasive customer testimonial", "rating": 5 },
      { "name": "Reviewer Name 2", "text": "Ultra-persuasive customer testimonial", "rating": 5 },
      { "name": "Reviewer Name 3", "text": "Ultra-persuasive customer testimonial", "rating": 5 }
    ],
    "visualPrompt": "Photographic prompt for the testimonial section showing happy customers or trust context"
  },
  "howItWorks": {
    "title": "Infographic Title",
    "steps": [
      { "title": "Step 1 Title", "description": "Actionable step explanation" },
      { "title": "Step 2 Title", "description": "Actionable step explanation" },
      { "title": "Step 3 Title", "description": "Actionable step explanation" }
    ],
    "visualPrompt": "Photographic prompt of the product being used or visual instructions"
  },
  "problem": {
    "headline": "Pain Point Headline agitating the core frustration",
    "description": "Agonizing problem description showing what the user loses without this solution",
    "visualPrompt": "Moody, high-contrast dark visual prompt agitating the problem"
  },
  "solution": {
    "headline": "Relief Headline introducing the product",
    "description": "Aspirational description of the transformation and ease the product provides",
    "visualPrompt": "Bright, highlight-lit visual prompt introducing the product as a heroic solution"
  },
  "urgency": {
    "headline": "Scarcity/Urgent offer headline",
    "description": "Compelling call detailing why they must act today",
    "ctaText": "CTA Button Text",
    "visualPrompt": "Dynamic, high-energy photographic prompt for the purchase trigger"
  },
  "guarantee": {
    "headline": "Trust guarantee headline",
    "description": "Elaborate risk-free satisfaction details to build absolute trust",
    "visualPrompt": "Luxury studio photographic prompt with quality indicators"
  },
  "faq": {
    "title": "FAQ Section Title",
    "items": [
      { "question": "Objection Question 1", "answer": "Reassuring, clear answer overcoming buying block" },
      { "question": "Objection Question 2", "answer": "Reassuring, clear answer overcoming buying block" },
      { "question": "Objection Question 3", "answer": "Reassuring, clear answer overcoming buying block" }
    ],
    "visualPrompt": "Minimalistic studio photography layout"
  },
  "ctaFooter": {
    "headline": "Final conversion headline",
    "subheadline": "Last emotional pitch to purchase",
    "ctaText": "CTA Button Text",
    "visualPrompt": "Luxury close-up hero studio prompt"
  }
}`
          },
          {
            role: "user",
            content: `Generate the full landing page JSON for: ${productTitle}.`
          }
        ]
      });

      const copyData = JSON.parse(response.choices[0]?.message?.content || "{}");
      return { success: true, copyData };
    } catch (error: any) {
      console.error("GPT Landing Page Copy Generation Error:", error);
      return { success: false, error: error.message };
    }
  }

  if (intent === "publish_lp") {
    const productTitle = formData.get("productTitle") as string;
    const lpTitle = formData.get("lpTitle") as string || `AI Landing Page: ${productTitle}`;
    const copyJSON = formData.get("copyJSON") as string;
    const imagesJSON = formData.get("imagesJSON") as string;
    const primaryColor = formData.get("primaryColor") as string || "#6366F1";
    const backgroundColor = formData.get("backgroundColor") as string || "#F9FAFB";
    const textColor = formData.get("textColor") as string || "#111827";
    const language = formData.get("language") as string || "English";
    const publishMode = formData.get("publishMode") as string || "visual_only";
    const sectionsOrderJSON = formData.get("sectionsOrderJSON") as string || "[]";
    const codEmbed = formData.get("codEmbed") as string || "";
    const codBgColor = formData.get("codBgColor") as string || "#FFFFFF";

    try {
      const copy = JSON.parse(copyJSON);
      const images = JSON.parse(imagesJSON);
      const sectionsOrder = JSON.parse(sectionsOrderJSON);

      // Generate Inline-CSS responsive HTML
      const htmlContent = generateLPHTML(copy, images, {
        primary: primaryColor,
        background: backgroundColor,
        text: textColor,
        language,
        publishMode,
        codEmbed,
        codBgColor
      }, sectionsOrder);

      // Call Shopify GraphQL to create Online Store Page
      const response = await admin.graphql(`
        mutation pageCreate($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page {
              id
              title
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          page: {
            title: lpTitle,
            body: htmlContent
          }
        }
      });

      const json = await response.json();
      const userErrors = json?.data?.pageCreate?.userErrors || [];

      if (userErrors.length > 0) {
        return { success: false, error: userErrors[0].message };
      }

      const pageHandle = json?.data?.pageCreate?.page?.handle || "";
      const pageId = json?.data?.pageCreate?.page?.id || "";

      return { success: true, publishedPage: true, pageHandle, pageId, lpTitle };
    } catch (error: any) {
      console.error("Shopify Page publishing error:", error);
      return { success: false, error: error.message };
    }
  }

  if (intent === "publish_to_product") {
    const productId = formData.get("productId") as string;
    const imageUrl = formData.get("imageUrl") as string;
    const productTitle = formData.get("productTitle") as string;

    if (productId.startsWith("demo-")) {
      return { success: false, error: "Cannot attach images to Demo Products. Please select a real product from your Shopify store." };
    }

    try {
      const response = await admin.graphql(`
        mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
          productCreateMedia(media: $media, productId: $productId) {
            media {
              id
              mediaContentType
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          productId,
          media: [
            {
              originalSource: imageUrl,
              mediaContentType: "IMAGE",
              alt: `${productTitle} - AI Studio Shot`
            }
          ]
        }
      });

      const json = await response.json();
      const userErrors = json?.data?.productCreateMedia?.userErrors || [];

      if (userErrors.length > 0) {
        return { success: false, error: userErrors[0].message };
      }

      return { success: true, published: true, productTitle };
    } catch (error: any) {
      console.error("Publish to product error:", error);
      return { success: false, error: error.message };
    }
  }

  return { success: false, error: "Invalid intent" };
};

export default function Index() {
  const { products, shopDomain, isDemo, installedApps = [] } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const pollFetcher = useFetcher<typeof action>();
  const copyFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  // Concurrent jobs map (maps sectionKey -> jobId or "starting")
  const [pendingJobs, setPendingJobs] = useState<Record<string, string>>({});

  // Landing Page Suite States
  const [lpSelectedProductId, setLpSelectedProductId] = useState(products[0]?.id || "");
  const [lpCurrentProduct, setLpCurrentProduct] = useState<Product | null>(products[0] || null);
  const [lpDescription, setLpDescription] = useState("");
  const [lpLanguage, setLpLanguage] = useState("Arabic");
  const [lpMarket, setLpMarket] = useState("Morocco");
  const [lpDialect, setLpDialect] = useState("Moroccan Darija");
  const [lpAudience, setLpAudience] = useState("General Audience");
  const [lpCategory, setLpCategory] = useState("Product");
  const [lpPriceBefore, setLpPriceBefore] = useState("");
  const [lpPriceAfter, setLpPriceAfter] = useState("");
  const [lpFreeDelivery, setLpFreeDelivery] = useState(true);

  // Dynamic Dialect Options based on Language & Country selection
  const dialectOptions = useMemo(() => {
    if (lpLanguage === "Arabic") {
      if (lpMarket === "Morocco") {
        return [
          { label: "Moroccan Darija (الدارجة المغربية)", value: "Moroccan Darija" },
          { label: "Modern Standard Arabic (الفصحى)", value: "Standard" },
        ];
      }
      if (lpMarket === "Algeria") {
        return [
          { label: "Algerian Darija (الدارجة الجزائرية)", value: "Algerian Darija" },
          { label: "Modern Standard Arabic (الفصحى)", value: "Standard" },
        ];
      }
      if (lpMarket === "Tunisia") {
        return [
          { label: "Tunisian Darija (الدارجة التونسية)", value: "Tunisian Darija" },
          { label: "Modern Standard Arabic (الفصحى)", value: "Standard" },
        ];
      }
      return [{ label: "Modern Standard Arabic (الفصحى)", value: "Standard" }];
    }
    if (lpLanguage === "French") {
      return [
        { label: "North African French (Maghreb)", value: "North African French" },
        { label: "Standard French (Français)", value: "Standard" },
      ];
    }
    return [{ label: "Standard English", value: "Standard" }];
  }, [lpLanguage, lpMarket]);

  // Synchronize dialect when language or country changes
  useEffect(() => {
    if (lpLanguage === "Arabic") {
      if (lpMarket === "Morocco") setLpDialect("Moroccan Darija");
      else if (lpMarket === "Algeria") setLpDialect("Algerian Darija");
      else if (lpMarket === "Tunisia") setLpDialect("Tunisian Darija");
      else setLpDialect("Standard");
    } else if (lpLanguage === "French") {
      setLpDialect("North African French");
    } else {
      setLpDialect("Standard");
    }
  }, [lpLanguage, lpMarket]);

  // Section builder
  const [lpSections, setLpSections] = useState<string[]>(["hero", "benefits", "cta_footer"]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Generated LP Copy & Images
  const [generatedCopy, setGeneratedCopy] = useState<any>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});

  // Theme Settings
  const [primaryColor, setPrimaryColor] = useState("#6366F1");
  const [backgroundColor, setBackgroundColor] = useState("#F9FAFB");
  const [textColor, setTextColor] = useState("#111827");
  const [lpTitle, setLpTitle] = useState(products[0]?.title ? `AI Landing Page: ${products[0].title}` : "AI Product Landing Page");
  const [publishMode, setPublishMode] = useState("visual_only");
  const [lpCodApp, setLpCodApp] = useState("easysell");
  const [lpCodBgColor, setLpCodBgColor] = useState("#FFFFFF");
  const [lpCodEmbed, setLpCodEmbed] = useState('<div class="easy-sell-cod-form" style="padding: 20px; background: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin: 15px auto; max-width: 500px; text-align: center;"><p style="font-weight: bold; font-size: 1.1rem; color: #111827; margin-bottom: 8px;">📝 COD Order Form Loading...</p><p style="color: #6B7280; font-size: 0.9rem; margin: 0;">EasySell COD Form app will automatically mount here on your live storefront!</p></div>');

  // Automatically detect installed COD apps on mount or loader reload
  useEffect(() => {
    if (installedApps && installedApps.length > 0) {
      const hasEasySell = installedApps.some(app => app.toLowerCase().includes("easysell") || app.toLowerCase().includes("easy sell"));
      const hasWebi = installedApps.some(app => app.toLowerCase().includes("webi") || app.toLowerCase().includes("leadform") || app.toLowerCase().includes("lead form"));
      const hasCodFast = installedApps.some(app => app.toLowerCase().includes("cod fast") || app.toLowerCase().includes("codfast") || app.toLowerCase().includes("codify"));
      const hasRevy = installedApps.some(app => app.toLowerCase().includes("revy"));
      const hasSherpas = installedApps.some(app => app.toLowerCase().includes("sherpas"));

      if (hasWebi) {
        setLpCodApp("webi");
      } else if (hasEasySell) {
        setLpCodApp("easysell");
      } else if (hasCodFast) {
        setLpCodApp("codfast");
      } else if (hasRevy) {
        setLpCodApp("revy");
      } else if (hasSherpas) {
        setLpCodApp("sherpas");
      }
    }
  }, [installedApps]);

  // Synchronize HTML shortcodes dynamically based on selected app and current product ID
  useEffect(() => {
    const rawProductId = lpCurrentProduct?.id ? lpCurrentProduct.id.split("/").pop() : "";
    if (lpCodApp === "easysell") {
      setLpCodEmbed(`<div class="easy-sell-cod-form" data-product-id="${rawProductId}"></div>`);
    } else if (lpCodApp === "webi") {
      setLpCodEmbed(`<div class="webi-leadform-container" data-product-id="${rawProductId}"></div>`);
    } else if (lpCodApp === "codfast") {
      setLpCodEmbed(`<div class="codfast-form" data-product-id="${rawProductId}"></div>`);
    } else if (lpCodApp === "revy") {
      setLpCodEmbed(`<div id="revy-cod-form" data-product-id="${rawProductId}"></div>`);
    } else if (lpCodApp === "sherpas") {
      setLpCodEmbed(`<div class="sherpas-cod-form-container" data-product-id="${rawProductId}"></div>`);
    } else if (lpCodApp === "shopify_buy") {
      setLpCodEmbed(`<div id="shopify-direct-checkout" style="text-align: center; padding: 20px;"><button style="background: #10B981; color: white; padding: 12px 28px; font-weight: bold; border-radius: 6px; border: none; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 12px rgba(16,185,129,0.2);" onclick="window.location.href='/cart/${rawProductId}:1'">🛒 BUY NOW (DIRECT CHECKOUT)</button></div>`);
    }
  }, [lpCodApp, lpCurrentProduct?.id]);

  // Published Link State
  const [publishedLink, setPublishedLink] = useState<string | null>(null);

  // Sync background copy generation results
  useEffect(() => {
    const res = copyFetcher.data as any;
    if (res?.success && res.copyData) {
      setGeneratedCopy(res.copyData);
      localStorage.setItem("pageforge_active_lp_copy", JSON.stringify(res.copyData));
    }
  }, [copyFetcher.data]);

  // Automatically trigger background copy generation when campaign inputs change
  useEffect(() => {
    if (!lpCurrentProduct || isDemo) return;
    
    const title = lpCurrentProduct.title;
    if (copyFetcher.state === "idle") {
      copyFetcher.submit(
        {
          intent: "generate_copy",
          productTitle: title,
          productDescription: lpDescription || title,
          language: lpLanguage,
          dialect: lpDialect,
          market: lpMarket || "Global Market",
          audience: lpAudience || "General Audience",
          category: lpCategory || "Product",
          tone: "premium",
          platform: "mobile",
          goal: "conversions",
          showFreeDelivery: lpFreeDelivery ? "true" : "false",
          showCTA: "true",
          ctaText: lpLanguage === "Arabic" ? "احصل عليه الآن" : "Shop Now",
        },
        { method: "POST" }
      );
    }
  }, [lpCurrentProduct?.id, lpLanguage, lpDialect, lpMarket, lpDescription, lpAudience, lpCategory, lpFreeDelivery]);

  const handleOpenResourcePicker = async () => {
    const selection = await (shopify as any).resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
    });
    if (!selection || selection.length === 0) return;
    const picked = selection[0];
    const product: Product = {
      id: picked.id,
      title: picked.title,
      handle: picked.handle,
      featuredImage: picked.images?.[0]?.originalSrc
        ? { url: picked.images[0].originalSrc }
        : null,
    };
    setLpCurrentProduct(product);
    setLpSelectedProductId(picked.id);
    setLpCategory(picked.title.split(" ")[0] || "Product");
    setLpTitle(`AI Landing Page: ${picked.title}`);
    setGeneratedImages({});
  };

  // Load LP images from localStorage on start
  useEffect(() => {
    try {
      const storedLP = localStorage.getItem("pageforge_active_lp_copy");
      if (storedLP) setGeneratedCopy(JSON.parse(storedLP));
      const storedLPImages = localStorage.getItem("pageforge_active_lp_images");
      if (storedLPImages) setGeneratedImages(JSON.parse(storedLPImages));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const actionData = fetcher.data as any;

  // Sync action results (for publishing or copywriting updates)
  useEffect(() => {
    const res = actionData as any;
    if (res?.success) {
      if (res.publishedPage) {
        shopify.toast.show(`Page "${res.lpTitle}" published!`);
        const cleanShop = shopDomain.replace(".myshopify.com", "");
        setPublishedLink(`https://admin.shopify.com/store/${cleanShop}/pages/${res.pageHandle}`);
      }
    } else if (actionData?.error) {
      shopify.toast.show(`Error: ${actionData.error}`, { isError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData, shopify, shopDomain]);

  // Poll active background jobs in parallel
  useEffect(() => {
    const activeSectionKeys = Object.keys(pendingJobs).filter(key => pendingJobs[key] !== "starting");
    if (activeSectionKeys.length === 0) return;

    const interval = setInterval(() => {
      activeSectionKeys.forEach(async (sectionKey) => {
        const jobId = pendingJobs[sectionKey];
        try {
          const targetUrl = window.location.pathname + window.location.search + (window.location.search ? "&index" : "?index") + "&_data=routes/app._index";
          const res = await window.fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ intent: "check_job", jobId }),
          });
          const data = await res.json();
          if (data?.success) {
            if (data.imageUrl) {
              setGeneratedImages((prev) => {
                const updated = { ...prev, [sectionKey]: data.imageUrl };
                localStorage.setItem("pageforge_active_lp_images", JSON.stringify(updated));
                return updated;
              });
              setPendingJobs((prev) => {
                const updated = { ...prev };
                delete updated[sectionKey];
                return updated;
              });
              shopify.toast.show(`${sectionKey.toUpperCase()} section image generated!`);
            } else if (data.status === "failed" || data.status === "error") {
              shopify.toast.show(`Generation failed for ${sectionKey}: ${data.error || "Failed"}`, { isError: true });
              setPendingJobs((prev) => {
                const updated = { ...prev };
                delete updated[sectionKey];
                return updated;
              });
            }
          } else {
            shopify.toast.show(`Error checking ${sectionKey}: ${data?.error || "Job failed"}`, { isError: true });
            setPendingJobs((prev) => {
              const updated = { ...prev };
              delete updated[sectionKey];
              return updated;
            });
          }
        } catch (err) {
          console.error(`Error polling job for ${sectionKey}:`, err);
        }
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [pendingJobs]);

  const handleGenerateSectionImage = async (sectionKey: string) => {
    // Add to generating state as "starting"
    setPendingJobs((prev) => ({ ...prev, [sectionKey]: "starting" }));

    const productImageUrl = lpCurrentProduct?.featuredImage?.url || "";
    const sectionCopy = generatedCopy?.[sectionKey];
    const customPrompt = sectionCopy?.visualPrompt || sectionCopy?.visual_prompt || "";

    const parts: string[] = [lpCurrentProduct?.title || "product"];
    if (lpDescription) parts.push(lpDescription);
    if (lpPriceBefore && lpPriceAfter) parts.push(`Original price ${lpPriceBefore}, now only ${lpPriceAfter}`);
    const fallbackPrompt = parts.join(". ");

    try {
      const targetUrl = window.location.pathname + window.location.search + (window.location.search ? "&index" : "?index") + "&_data=routes/app._index";
      const res = await window.fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          intent: "generate",
          customPrompt: customPrompt || fallbackPrompt,
          sectionType: sectionKey,
          language: lpLanguage,
          market: lpMarket || "Global Market",
          audience: lpDescription || lpAudience,
          productCategory: lpCategory,
          highQuality: "true",
          productImageUrl,
        }),
      });

      const data = await res.json();
      if (data?.success && data.jobId) {
        setPendingJobs((prev) => ({ ...prev, [sectionKey]: data.jobId }));
      } else {
        throw new Error(data?.error || "Failed to start generation job");
      }
    } catch (err: any) {
      shopify.toast.show(`Error starting ${sectionKey}: ${err.message}`, { isError: true });
      setPendingJobs((prev) => {
        const updated = { ...prev };
        delete updated[sectionKey];
        return updated;
      });
    }
  };

  const handleGenerateAll = () => {
    const remaining = lpSections.filter((s) => !generatedImages[s] && !pendingJobs[s]);
    if (remaining.length === 0) return;
    remaining.forEach((key) => {
      handleGenerateSectionImage(key);
    });
  };

  const handleSectionDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleSectionDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...lpSections];
    const [removed] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, removed);
    setLpSections(updated);
    setDragIndex(index);
  };
  const handleSectionDragEnd = () => setDragIndex(null);

  const handlePublishLP = () => {
    const title = lpCurrentProduct?.title || "Product";
    const copy = generatedCopy || {
      hero: { headline: title, subheadline: lpDescription || "", ctaText: "Shop Now", visualPrompt: "" },
      problem: { headline: "", description: "", visualPrompt: "" },
      solution: { headline: "", description: "", visualPrompt: "" },
      benefits: { title: "", items: [], visualPrompt: "" },
      guarantee: { headline: "", description: "", visualPrompt: "" },
      urgency: { headline: "", description: "", visualPrompt: "" },
      ctaFooter: { headline: title, subheadline: lpDescription || "", ctaText: "Shop Now", visualPrompt: "" },
    };
    fetcher.submit(
      {
        intent: "publish_lp",
        productTitle: title,
        lpTitle,
        copyJSON: JSON.stringify(copy),
        imagesJSON: JSON.stringify(generatedImages),
        primaryColor,
        backgroundColor,
        textColor,
        language: lpLanguage,
        publishMode,
        sectionsOrderJSON: JSON.stringify(lpSections),
        codEmbed: lpCodEmbed,
        codBgColor: lpCodBgColor,
      },
      { method: "POST" }
    );
  };

  const isPublishingLP = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "publish_lp";

  return (
    <Page fullWidth>
      <TitleBar title="PageForge LP Suite" />

      {/* Dynamic Cairo Font Override for Arabic Prompts & Inputs */}
      {lpLanguage === "Arabic" && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
          <style dangerouslySetInnerHTML={{
            __html: `
              *, input, textarea, select, button, span, div, h1, h2, h3, h4, h5, p, label {
                font-family: 'Cairo', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              }
            `
          }} />
        </>
      )}

      {/* Embed Dynamic Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .lp-section-card {
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 20px;
          background: white;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
          transition: all 0.2s ease;
        }
        .lp-section-card:hover {
          border-color: #6366F1;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08);
        }
        .color-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 0 1px #DDD;
          display: inline-block;
          margin-right: 8px;
          cursor: pointer;
        }
        .iphone-mock {
          position: relative;
          width: 320px;
          height: 640px;
          background: #111;
          border-radius: 40px;
          border: 12px solid #282830;
          box-shadow: 0 25px 50px rgba(0,0,0,0.22), inset 0 0 5px rgba(255,255,255,0.25);
          margin: 0 auto;
          overflow: hidden;
        }
        .iphone-mock::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border: 3px solid #3c3c44;
          border-radius: 30px;
          pointer-events: none;
          z-index: 10;
        }
        .iphone-notch {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          width: 95px;
          height: 22px;
          background: #000;
          border-radius: 11px;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 12px;
          box-sizing: border-box;
        }
        .iphone-camera {
          width: 8px;
          height: 8px;
          background: #1c1c2e;
          border-radius: 50%;
          border: 1px solid #000;
        }
        .iphone-screen {
          width: 100%;
          height: 100%;
          overflow-y: scroll;
          background: #F9FAFB;
          padding-top: 36px;
          scrollbar-width: none;
          box-sizing: border-box;
        }
        .iphone-screen::-webkit-scrollbar {
          display: none;
        }
        .iphone-home {
          position: absolute;
          bottom: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 110px;
          height: 4px;
          background: rgba(0,0,0,0.4);
          border-radius: 2px;
          z-index: 20;
        }
        .section-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          border: 1px solid #E5E7EB;
          background: white;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .section-chip:hover {
          border-color: #6366F1;
          background: #F5F3FF;
          color: #6366F1;
        }
        .section-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #E5E7EB;
          background: white;
          transition: all 0.15s ease;
          cursor: grab;
        }
        .section-row:active { cursor: grabbing; }
        .section-row.dragging {
          opacity: 0.5;
          border-color: #6366F1;
        }
        .section-row.drag-over {
          border-color: #6366F1;
          background: #F5F3FF;
          transform: scale(1.01);
        }
        .section-row-handle {
          color: #9CA3AF;
          font-size: 14px;
          cursor: grab;
          flex-shrink: 0;
        }
        .section-row-label {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .section-row-status {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 600;
        }
        .status-done {
          background: #D1FAE5;
          color: #065F46;
        }
        .status-pending {
          background: #F3F4F6;
          color: #6B7280;
        }
        .status-loading {
          background: #EDE9FE;
          color: #5B21B6;
        }
        .lp-builder-layout {
          display: flex;
          gap: 24px;
          align-items: flex-start;
        }
        .lp-builder-left {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .lp-builder-right {
          width: 340px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .phone-wrapper {
          position: sticky;
          top: 20px;
        }
        .lp-step-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .lp-step-badge {
          width: 26px;
          height: 26px;
          background: #6366F1;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }
      ` }} />

      <BlockStack gap="500">

        <div className="lp-builder-layout">

                  {/* ── LEFT PANEL ─────────────────────────────────────────── */}
                  <div className="lp-builder-left">

                    {/* STEP 1: Product Selection */}
                    <Card>
                      <BlockStack gap="300">
                        <div className="lp-step-header">
                          <div className="lp-step-badge">1</div>
                          <Text as="h3" variant="headingMd">Select Product</Text>
                        </div>
                        {isDemo ? (
                          <Banner tone="warning">
                            <Text as="p" variant="bodySm">
                              Demo mode — connect a real Shopify store to use the product picker.
                            </Text>
                          </Banner>
                        ) : lpCurrentProduct ? (
                          <InlineStack gap="400" blockAlign="center">
                            {lpCurrentProduct.featuredImage?.url && (
                              <Thumbnail
                                source={lpCurrentProduct.featuredImage.url}
                                size="large"
                                alt={lpCurrentProduct.title}
                              />
                            )}
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {lpCurrentProduct.title}
                              </Text>
                              <Button size="slim" onClick={handleOpenResourcePicker}>
                                Change Product
                              </Button>
                            </BlockStack>
                          </InlineStack>
                        ) : (
                          <Button onClick={handleOpenResourcePicker}>
                            Choose Product
                          </Button>
                        )}

                      </BlockStack>
                    </Card>

                    {/* STEP 2: Campaign Details */}
                    <Card>
                      <BlockStack gap="300">
                        <div className="lp-step-header">
                          <div className="lp-step-badge">2</div>
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h3" variant="headingMd">Campaign Details</Text>
                            <Text as="span" variant="bodySm" tone="subdued">— all optional</Text>
                          </InlineStack>
                        </div>
                        <Grid>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                            <Select
                              label="Language"
                              options={[
                                { label: "Arabic (العربية)", value: "Arabic" },
                                { label: "French (Français)", value: "French" },
                                { label: "English", value: "English" },
                              ]}
                              value={lpLanguage}
                              onChange={setLpLanguage}
                            />
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                            <Select
                              label="Target Country"
                              options={[
                                { label: "Morocco (المغرب)", value: "Morocco" },
                                { label: "Algeria (الجزائر)", value: "Algeria" },
                                { label: "Tunisia (تونس)", value: "Tunisia" },
                              ]}
                              value={lpMarket}
                              onChange={setLpMarket}
                            />
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                            <Select
                              label="Dialect / Written Style"
                              options={dialectOptions}
                              value={lpDialect}
                              onChange={setLpDialect}
                            />
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                            <TextField
                              label="Price Before"
                              value={lpPriceBefore}
                              onChange={setLpPriceBefore}
                              autoComplete="off"
                              placeholder="e.g. $99"
                            />
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                            <TextField
                              label="Price After"
                              value={lpPriceAfter}
                              onChange={setLpPriceAfter}
                              autoComplete="off"
                              placeholder="e.g. $49"
                            />
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                            <TextField
                              label="Target Audience"
                              value={lpAudience}
                              onChange={setLpAudience}
                              autoComplete="off"
                              placeholder="e.g. Active Men, Skincare Lovers"
                            />
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                            <TextField
                              label="Product Category"
                              value={lpCategory}
                              onChange={setLpCategory}
                              autoComplete="off"
                              placeholder="e.g. Cosmetics, Electronics"
                            />
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                            <Box paddingBlockStart="100">
                              <Checkbox
                                label="Offer Free Express Delivery (automatically highlights free shipping incentives in copy & visual prompts)"
                                checked={lpFreeDelivery}
                                onChange={setLpFreeDelivery}
                              />
                            </Box>
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                            <TextField
                              label="Description"
                              value={lpDescription}
                              onChange={setLpDescription}
                              multiline={2}
                              autoComplete="off"
                              placeholder="What makes this product special — ingredients, benefits, unique selling points…"
                            />
                          </Grid.Cell>
                        </Grid>
                      </BlockStack>
                    </Card>

                    {/* STEP 3: Section Builder */}
                    <Card>
                      <BlockStack gap="400">
                        <div className="lp-step-header">
                          <div className="lp-step-badge">3</div>
                          <Text as="h3" variant="headingMd">Page Sections</Text>
                        </div>

                        {/* Available sections palette */}
                        <BlockStack gap="150">
                          <Text as="p" variant="bodyXs" fontWeight="semibold" tone="subdued">ADD SECTIONS</Text>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {ALL_SECTIONS.filter(s => !lpSections.includes(s.key)).map(s => (
                              <button
                                key={s.key}
                                className="section-chip"
                                onClick={() => setLpSections(prev => [...prev, s.key])}
                              >
                                <span>{s.icon}</span>
                                <span>{s.label}</span>
                                <span style={{ color: "#9CA3AF", fontSize: "16px", lineHeight: 1, marginLeft: "2px" }}>+</span>
                              </button>
                            ))}
                            {ALL_SECTIONS.every(s => lpSections.includes(s.key)) && (
                              <Text as="p" variant="bodySm" tone="subdued">All sections added</Text>
                            )}
                          </div>
                        </BlockStack>

                        {/* Selected sections — drag to reorder */}
                        {lpSections.length > 0 && (
                          <BlockStack gap="150">
                            <Text as="p" variant="bodyXs" fontWeight="semibold" tone="subdued">YOUR PAGE — drag to reorder</Text>
                            <BlockStack gap="100">
                              {lpSections.map((key, index) => {
                                const meta = ALL_SECTIONS.find(s => s.key === key)!;
                                const isGenerating = !!pendingJobs[key];
                                const isDone = !!generatedImages[key];
                                const isCod = key === "cod_form";
                                return (
                                  <BlockStack gap="100" key={key}>
                                    <div
                                      className={`section-row${dragIndex === index ? " dragging" : ""}`}
                                      draggable
                                      onDragStart={(e) => handleSectionDragStart(e, index)}
                                      onDragOver={(e) => handleSectionDragOver(e, index)}
                                      onDragEnd={handleSectionDragEnd}
                                    >
                                      <span className="section-row-handle">⠿⠿</span>
                                      <span className="section-row-label">
                                        {meta.icon} {meta.label}
                                      </span>
                                      {isCod ? (
                                        <span className="section-row-status status-done" style={{ background: "#E0F2FE", color: "#0369A1" }}>✓ Live Block</span>
                                      ) : isGenerating ? (
                                        <span className="section-row-status status-loading">Generating…</span>
                                      ) : isDone ? (
                                        <span className="section-row-status status-done">✓ Done</span>
                                      ) : (
                                        <span className="section-row-status status-pending">Pending</span>
                                      )}
                                      {!isCod && (
                                        <Button
                                          size="slim"
                                          onClick={() => handleGenerateSectionImage(key)}
                                          loading={isGenerating}
                                          disabled={isGenerating}
                                        >
                                          {isDone ? "Redo" : "Generate"}
                                        </Button>
                                      )}
                                      <Button
                                        size="slim"
                                        variant="plain"
                                        tone="critical"
                                        onClick={() => {
                                          setLpSections(prev => prev.filter((_, i) => i !== index));
                                          if (!isCod) {
                                            setGeneratedImages(prev => { const n = { ...prev }; delete n[key]; return n; });
                                          }
                                        }}
                                        disabled={isGenerating}
                                      >
                                        ✕
                                      </Button>
                                    </div>
                                    
                                    {isCod && (
                                      <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: "8px", border: "1px solid #E5E7EB", marginTop: "-4px", marginBottom: "8px" }}>
                                        <BlockStack gap="300">
                                          {/* Installed App Detection Status */}
                                          {installedApps.length > 0 && (
                                            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", padding: "8px 12px", borderRadius: "6px" }}>
                                              <span style={{ fontSize: "11px", color: "#16A34A", fontWeight: "bold" }}>
                                                🔍 Auto-detected Store Apps: {installedApps.join(", ") || "None"}
                                              </span>
                                            </div>
                                          )}

                                          <Select
                                            label="Select COD App Template"
                                            options={[
                                              { label: "EasySell COD Form & Up-Sells", value: "easysell" },
                                              { label: "WEBI – LeadForm Order Form COD", value: "webi" },
                                              { label: "COD Fast / Codify", value: "codfast" },
                                              { label: "Revy Cash on Delivery", value: "revy" },
                                              { label: "Sherpas COD Form", value: "sherpas" },
                                              { label: "Shopify Buy Button (Direct Checkout)", value: "shopify_buy" },
                                              { label: "Custom HTML Embed / Shortcode", value: "custom" },
                                            ]}
                                            value={lpCodApp}
                                            onChange={setLpCodApp}
                                          />

                                          <InlineStack gap="200">
                                            <TextField
                                              label="Section Background Color"
                                              value={lpCodBgColor}
                                              onChange={setLpCodBgColor}
                                              autoComplete="off"
                                              prefix={<span className="color-circle" style={{ backgroundColor: lpCodBgColor }} />}
                                              helpText="Matches the COD form block container background color with your page theme."
                                            />
                                          </InlineStack>

                                          <TextField
                                            label="COD Embed Script / HTML Widget Code"
                                            value={lpCodEmbed}
                                            onChange={setLpCodEmbed}
                                            multiline={3}
                                            autoComplete="off"
                                            helpText="Automatically generated from the selected template. You can customize this HTML freely when Custom HTML is selected."
                                            disabled={lpCodApp !== "custom"}
                                          />
                                        </BlockStack>
                                      </div>
                                    )}
                                  </BlockStack>
                                );
                              })}
                            </BlockStack>
                          </BlockStack>
                        )}

                        {/* Generate All */}
                        {lpSections.length > 0 && (
                          <InlineStack gap="300" blockAlign="center">
                            <Button
                              variant="primary"
                              size="large"
                              onClick={handleGenerateAll}
                              loading={Object.keys(pendingJobs).length > 0}
                              disabled={lpSections.length > 0 && lpSections.every(s => !!generatedImages[s] || !!pendingJobs[s])}
                            >
                              {Object.keys(pendingJobs).length > 0
                                ? `Generating (${Object.keys(pendingJobs).length} running)…`
                                : "Generate All Sections"}
                            </Button>
                            {Object.keys(generatedImages).length > 0 && (
                              <Button
                                variant="plain"
                                tone="critical"
                                onClick={() => { setGeneratedImages({}); setPendingJobs({}); }}
                                disabled={Object.keys(pendingJobs).length > 0}
                              >
                                Reset All
                              </Button>
                            )}
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Card>

                  </div>

                  {/* ── RIGHT PANEL: Phone Mock ─────────────────────────────── */}
                  <div className="lp-builder-right">
                    <div className="phone-wrapper">

                      {/* Phone Preview */}
                      <Card>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">Phone Preview</Text>
                            {lpCurrentProduct && (
                              <Text as="p" variant="bodyXs" tone="subdued">{lpCurrentProduct.title}</Text>
                            )}
                          </InlineStack>

                          <div className="iphone-mock">
                            <div className="iphone-notch">
                              <div className="iphone-camera"></div>
                            </div>
                            <div className="iphone-screen">
                              {lpFreeDelivery && (
                                <div style={{
                                  background: "#6366F1",
                                  color: "white",
                                  fontSize: "9px",
                                  fontWeight: "700",
                                  textAlign: "center",
                                  padding: "6px 8px",
                                  letterSpacing: "0.5px",
                                  textTransform: "uppercase",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "4px",
                                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                                  zIndex: 15,
                                  position: "relative"
                                }}>
                                  <span>🚚</span>
                                  <span>
                                    {lpLanguage === "Arabic" 
                                      ? "شحن مجاني سريع لجميع الطلبات اليوم!" 
                                      : "FREE EXPRESS SHIPPING TODAY ON ALL ORDERS!"}
                                  </span>
                                </div>
                              )}
                              {lpSections.length === 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px", textAlign: "center" }}>
                                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>📱</div>
                                  <p style={{ fontSize: "11px", color: "#9CA3AF", margin: 0, lineHeight: "1.5" }}>
                                    Add sections and generate to preview your landing page
                                  </p>
                                </div>
                              ) : (
                                lpSections.map(key => {
                                  const meta = ALL_SECTIONS.find(s => s.key === key)!;
                                  const isGen = !!pendingJobs[key];
                                  const isCod = key === "cod_form";

                                  if (isCod) {
                                    return (
                                      <div key={key} style={{ width: "100%", background: lpCodBgColor || "#FFFFFF", padding: "20px 16px", borderBottom: "1px solid #E5E7EB", boxSizing: "border-box", flexShrink: 0 }}>
                                        <div style={{ background: "#F9FAFB", borderRadius: "10px", border: "1px dashed #6366F1", padding: "18px", textAlign: "center" }}>
                                          <p style={{ margin: "0 0 4px 0", fontSize: "11px", fontWeight: "800", color: "#4F46E5", letterSpacing: "0.5px" }}>📝 SIMULATED COD ORDER FORM</p>
                                          <p style={{ margin: "0 0 16px 0", fontSize: "9px", color: "#6B7280" }}>[Your Cash on Delivery Form App will load here]</p>
                                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", textAlign: lpLanguage === "Arabic" ? "right" : "left" }}>
                                            <div>
                                              <label style={{ fontSize: "9px", fontWeight: "bold", color: "#374151", display: "block", marginBottom: "4px" }}>
                                                {lpLanguage === "Arabic" ? "الاسم الكامل" : "Full Name"}
                                              </label>
                                              <input type="text" placeholder={lpLanguage === "Arabic" ? "أدخل اسمك الكامل" : "Enter full name"} disabled style={{ width: "100%", fontSize: "10px", padding: "8px", border: "1px solid #D1D5DB", borderRadius: "5px", background: "#FFF", boxSizing: "border-box" }} />
                                            </div>
                                            <div>
                                              <label style={{ fontSize: "9px", fontWeight: "bold", color: "#374151", display: "block", marginBottom: "4px" }}>
                                                {lpLanguage === "Arabic" ? "رقم الهاتف" : "Phone Number"}
                                              </label>
                                              <input type="text" placeholder={lpLanguage === "Arabic" ? "رقم الهاتف المحمول" : "Mobile phone number"} disabled style={{ width: "100%", fontSize: "10px", padding: "8px", border: "1px solid #D1D5DB", borderRadius: "5px", background: "#FFF", boxSizing: "border-box" }} />
                                            </div>
                                            <div>
                                              <label style={{ fontSize: "9px", fontWeight: "bold", color: "#374151", display: "block", marginBottom: "4px" }}>
                                                {lpLanguage === "Arabic" ? "عنوان الشحن بالتفصيل" : "Shipping Address"}
                                              </label>
                                              <input type="text" placeholder={lpLanguage === "Arabic" ? "المدينة، الشارع، المبنى" : "City, street, building"} disabled style={{ width: "100%", fontSize: "10px", padding: "8px", border: "1px solid #D1D5DB", borderRadius: "5px", background: "#FFF", boxSizing: "border-box" }} />
                                            </div>
                                            <button style={{ width: "100%", background: "#10B981", color: "white", fontWeight: "bold", fontSize: "11px", padding: "10px", border: "none", borderRadius: "5px", cursor: "not-allowed", marginTop: "4px", boxShadow: "0 2px 4px rgba(16,185,129,0.2)" }}>
                                              {lpLanguage === "Arabic" ? "تأكيد الطلب (الدفع عند الاستلام)" : "CONFIRM ORDER (PAY ON DELIVERY)"}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={key} style={{ width: "100%", aspectRatio: "1024/1536", position: "relative", background: "#F3F4F6", flexShrink: 0 }}>
                                      {generatedImages[key] ? (
                                        <img
                                          src={generatedImages[key]}
                                          alt={meta.label}
                                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                        />
                                      ) : (
                                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                                          {isGen ? (
                                            <>
                                              <Spinner size="small" />
                                              <span style={{ fontSize: "10px", color: "#6366F1" }}>Generating…</span>
                                            </>
                                          ) : (
                                            <>
                                              <span style={{ fontSize: "22px" }}>{meta.icon}</span>
                                              <span style={{ fontSize: "10px", color: "#9CA3AF" }}>{meta.label}</span>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            <div className="iphone-home"></div>
                          </div>
                        </BlockStack>
                      </Card>

                      {/* Publish — shown once at least one image is ready */}
                      {Object.keys(generatedImages).length > 0 && (
                        <Card>
                          <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">Publish to Shopify</Text>
                            <TextField
                              label="Page Title"
                              value={lpTitle}
                              onChange={setLpTitle}
                              autoComplete="off"
                            />
                            <InlineStack gap="200">
                              <TextField
                                label="Primary Color"
                                value={primaryColor}
                                onChange={setPrimaryColor}
                                autoComplete="off"
                                prefix={<span className="color-circle" style={{ backgroundColor: primaryColor }} />}
                              />
                              <TextField
                                label="Background"
                                value={backgroundColor}
                                onChange={setBackgroundColor}
                                autoComplete="off"
                                prefix={<span className="color-circle" style={{ backgroundColor: backgroundColor }} />}
                              />
                            </InlineStack>
                            <Select
                              label="Publish Layout Mode"
                              options={[
                                { label: "Seamless Visual Images (Hides theme header/footer - Best conversions!)", value: "visual_only" },
                                { label: "Standard Hybrid (Includes text copywriting + images inside theme)", value: "hybrid" },
                              ]}
                              value={publishMode}
                              onChange={setPublishMode}
                            />
                            <Button variant="primary" onClick={handlePublishLP} loading={isPublishingLP} size="large">
                              Publish Landing Page
                            </Button>
                            {publishedLink && (
                              <Banner title="Published!" tone="success">
                                <a href={publishedLink} target="_blank" rel="noreferrer" style={{ color: primaryColor, fontWeight: "bold" }}>
                                  View on Shopify →
                                </a>
                              </Banner>
                            )}
                          </BlockStack>
                        </Card>
                      )}

                    </div>
                  </div>

        </div>
      </BlockStack>
    </Page>
  );
}
