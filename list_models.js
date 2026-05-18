import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function main() {
  console.log("Listing available OpenAI models...");
  const list = await openai.models.list();
  const models = list.data.map(m => m.id).sort();
  console.log("Available Models:", JSON.stringify(models, null, 2));
}

main().catch(console.error);
