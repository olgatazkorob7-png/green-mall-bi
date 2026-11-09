import { createClient } from '@supabase/supabase-js';

async function run() {
  const url = "https://xheguppcqtfslacgbqzb.supabase.co";
  const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoZWd1cHBjcXRmc2xhY2dicXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNzg2MjcsImV4cCI6MjA4OTY1NDYyN30.AJyANTREQxwinYUPbohf-D5muNFQPCzMNb5l1Xo8mdk";
  const supabase = createClient(url, key);
  
  const { data } = await supabase.from('sales').select('*').limit(5);
  console.log(data);
}
run().catch(console.error);
