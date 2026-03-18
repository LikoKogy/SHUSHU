import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://kvnhenbplgeolziyoylg.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_RT4XakM14786zUdz6B_YWw_4OsZtWgh";

export const isCloud = !!(url && key);
console.log("[supabase] url:", url, "isCloud:", isCloud);

export const supabase = isCloud ? createClient(url, key) : null;
