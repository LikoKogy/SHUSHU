import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://wbqynoppdsrxrslttpek.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndicXlub3BwZHNyeHJzbHR0cGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTg4MjMsImV4cCI6MjA4OTQzNDgyM30.ED4iF2jrgpzTHpggCVmYbGrRahP1Q6mv9iFeZkIA5FQ";

export const isCloud = !!(url && key);

export const supabase = isCloud ? createClient(url, key) : null;
