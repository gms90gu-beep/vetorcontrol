// Read-only authenticated UI diagnostic for the isolated copy; never logs credentials.
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
const url = process.env.VITE_SUPABASE_URL;
if (url !== 'https://ljlyvtwuikwuqcgrbkii.supabase.co') throw new Error('Copy only');
const admin = createClient(url, process.env.COPY_SERVER_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const { data: grants, error: grantError } = await admin.from('platform_administrators').select('user_id').eq('is_active',true);
if (grantError || grants?.length!==1) throw new Error('Expected the one configured platform administrator');
const { data: actor, error: actorError } = await admin.auth.admin.getUserById(grants[0].user_id);
if (actorError || !actor.user?.email || !actor.user.email_confirmed_at) throw new Error('Verified administrator unavailable');
const { data: link, error: linkError } = await admin.auth.admin.generateLink({type:'magiclink',email:actor.user.email});
if (linkError || !link.properties?.hashed_token) throw new Error('Could not prepare isolated test session');
const { data: auth, error: authError } = await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'});
if (authError || !auth.session || auth.user?.id!==grants[0].user_id) throw new Error('Test session verification failed');
const cf = await fetch('https://api.cloudflare.com/client/v4/accounts/' + process.env.CLOUDFLARE_ACCOUNT_ID + '/workers/subdomain',{headers:{Authorization:'Bearer ' + process.env.CLOUDFLARE_API_TOKEN}}).then(r=>r.json());
const base='https://vetorcontrol-copy-validation.' + cf.result.subdomain + '.workers.dev';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({serviceWorkers:'block'});
  await context.addInitScript(({session})=>localStorage.setItem('sb-ljlyvtwuikwuqcgrbkii-auth-token',JSON.stringify(session)),{session:auth.session});
  const page = await context.newPage();
  page.on('response',async response=>{
    if (response.url().includes('_serverFn') && response.status()>=400) {
      console.log('Server function HTTP ' + response.status());
      const body=await response.text().catch(()=> '');
      for (const marker of ['Unauthorized: No session token provided','Unauthorized: Invalid token','Missing Supabase environment','Failed to fetch','Internal Server Error']) if (body.includes(marker)) console.log('Diagnostic: '+marker);
    }
  });
  await page.goto(base+'/platform',{waitUntil:'networkidle',timeout:60000});
  await page.getByRole('heading',{name:'Administração Geral',exact:true}).waitFor({timeout:15000});
  const error = page.getByText('Não foi possível carregar os municípios. Tente novamente.',{exact:true});
  if (await error.isVisible()) throw new Error('Authenticated platform list failed');
  await page.getByRole('cell',{name:'Euclides da Cunha',exact:true}).waitFor({timeout:15000});
  console.log('Authenticated browser: municipality row displayed successfully');
  await page.route('**/*',route=>route.request().url().includes('_serverFn') ? route.abort() : route.continue());
  await page.reload({waitUntil:'networkidle',timeout:60000});
  await page.getByRole('cell',{name:'Euclides da Cunha',exact:true}).waitFor({timeout:15000});
  if (await error.isVisible()) throw new Error('RLS fallback failed');
  console.log('Authenticated browser: read recovered with server-function transport blocked');
  await context.close();
} finally {
  await browser.close();
  await client.auth.signOut({scope:'local'});
}
