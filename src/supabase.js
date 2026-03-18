import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://kvnhenbplgeolziyoylg.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bmhlbmJwbGdlb2x6aXlveWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjcxMjgsImV4cCI6MjA4OTQ0MzEyOH0.S5xuqVIHtPniiPfMw-adPWMZnylyBina2ga-hLgE8YY";

export const isCloud = !!(url && key);
console.log("[supabase] url:", url, "isCloud:", isCloud);

export const supabase = isCloud ? createClient(url, key) : null;
