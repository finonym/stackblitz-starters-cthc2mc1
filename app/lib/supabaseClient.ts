import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zioeqyulyaofucuyfprl.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppb2VxeXVseWFvZnVjdXlmcHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODA1MTcsImV4cCI6MjA4NzY1NjUxN30.W7oCC82rB7JsAAJa5ZE6TKhdZ9WX-QB4VAKBJ-PZfg8";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);