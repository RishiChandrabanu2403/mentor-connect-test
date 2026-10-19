
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing Supabase URL or publishable key in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);
const allMentors = JSON.parse(
  fs.readFileSync("mentors-import.json", "utf8")
);

const uniqueMentors = new Map(
  allMentors.map((mentor) => [mentor.mentor_id, mentor])
);

const mentors = [...uniqueMentors.values()];

console.log(
  `Found ${allMentors.length} records; uploading ${mentors.length} unique mentors.`
);

const { data, error } = await supabase
  .from("mentors")
  .upsert(mentors, { onConflict: "mentor_id" })
  .select("mentor_id");

if (error) {
  console.error("Upload failed:", error.message);
  process.exit(1);
}

console.log(`Successfully uploaded ${data.length} mentors.`);
