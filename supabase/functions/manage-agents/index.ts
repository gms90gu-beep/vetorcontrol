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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify if the caller is a supervisor
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')
    
    const { data: { user }, error: authError } = await createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    ).auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !user) throw new Error('Unauthorized')

    const { action, agentData, userData } = await req.json()

    if (action === 'create' || action === 'create_manager') {
      const data = action === 'create' ? agentData : userData
      const { email, password, full_name, registration_number, city, role = 'agente' } = data

      // Validate role permissions
      const targetRole = action === 'create' ? 'agente' : role
      if (action === 'create_manager' && !['supervisor', 'coordenador'].includes(targetRole)) {
        throw new Error('Invalid manager role')
      }

      // 1. Create user in Auth
      const { data: authUser, error: createError } = await supabaseClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      })

      if (createError) throw createError

      // 2. Create profile
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .update({
          full_name,
          registration_number,
          city,
          is_active: true
        })
        .eq('id', authUser.user.id)

      if (profileError) throw profileError

      // 3. Set role
      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .insert({
          user_id: authUser.user.id,
          role: targetRole
        })

      if (roleError) throw roleError

      return new Response(JSON.stringify({ success: true, user: authUser.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'update_status') {
      const { userId, active } = agentData
      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({ is_active: active })
        .eq('id', userId)

      if (updateError) throw updateError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    throw new Error('Invalid action')

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
