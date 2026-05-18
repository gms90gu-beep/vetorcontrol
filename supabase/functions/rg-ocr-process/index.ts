import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

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

    // This is a simulation of an AI OCR processing
    // In a real production scenario, we would call an AI API like OpenAI (GPT-4o) or Anthropic
    // For this prototype, we'll simulate the extraction of multiple properties from an image
    
    console.log(`Processing image: ${image_url}`);

    // Mock data based on typical Endemias RG forms
    const mockExtractedData = {
      block_number: "042",
      street_name: "Rua das Palmeiras",
      neighborhood: "Jardim Planalto",
      properties: [
        {
          number: "120",
          type: "residence",
          complement: "Casa A",
          responsible_name: "Maria Silva",
          phone: "(11) 98765-4321",
          reference: "Perto da Padaria",
          container_count: 2,
          observations: "Cão bravo no quintal",
          possible_error: false
        },
        {
          number: "128",
          type: "residence",
          complement: "",
          responsible_name: "João Santos",
          phone: "",
          reference: "",
          container_count: 0,
          observations: "Dificuldade de acesso",
          possible_error: false
        },
        {
          number: "135",
          type: "commerce",
          complement: "Loja de Conveniência",
          responsible_name: "Roberto Almeida",
          phone: "(11) 91234-5678",
          reference: "Esquina",
          container_count: 1,
          observations: "Horário comercial: 08h às 18h",
          possible_error: false
        },
        {
          number: "142",
          type: "vacant_lot",
          complement: "",
          responsible_name: "",
          phone: "",
          reference: "Muro pichado",
          container_count: 0,
          observations: "Mato alto",
          possible_error: true // Simulating a field that might need review
        }
      ]
    };

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    return new Response(
      JSON.stringify(mockExtractedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
