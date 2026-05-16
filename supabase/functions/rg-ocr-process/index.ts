import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_url } = await req.json()

    if (!image_url) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // In a real implementation, we would call an OCR API like Google Vision or AWS Textract here.
    // For this prototype, we simulate a realistic OCR response after a small delay.
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Simulated OCR Result
    const mockData = {
      block_number: "122",
      street_name: "Rua das Palmeiras",
      area: "01",
      properties: [
        { number: "10", type: "residence", observations: "Portão cinza", sequence: 1 },
        { number: "15", type: "commerce", observations: "Padaria", sequence: 2 },
        { number: "22", type: "residence", observations: "Casa amarela", sequence: 3 },
        { number: "30", type: "vacant_lot", observations: "Terreno baldio", sequence: 4 },
        { number: "45", type: "strategic_point", observations: "Borracharia", sequence: 5 },
        { number: "12Z", type: "residence", observations: "OCR Error Test", sequence: 6, possible_error: true, suggestion: "122" }
      ]
    };

    return new Response(
      JSON.stringify(mockData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
