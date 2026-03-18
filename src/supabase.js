import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://wbqynoppdsrxrslttpek.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_O49xglSJrfQexBkNLIdnrQ_S2DmINH-";

export const isCloud = !!(url && key);
console.log("[supabase] url:", url, "isCloud:", isCloud);

export const supabase = isCloud ? createClient(url, key) : null;
