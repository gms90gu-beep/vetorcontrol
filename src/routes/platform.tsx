import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getPlatformMunicipalities,
  createMunicipalityDraft,
  registerMunicipalAdministrator,
} from '@/lib/platform.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { assertPlatformAdministrator } from '@/lib/platform-policy.mjs';

export const Route = createFileRoute('/platform')({
  beforeLoad: async () => {
    if (typeof window === 'undefined') return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({to:'/login'});
    const { data: access, error: roleError } = await (supabase as any).from('platform_administrators').select('is_active').eq('user_id', data.user.id).maybeSingle();
    if (roleError || access?.is_active !== true) throw redirect({to:'/dashboard'});
  },
  component: PlatformPage,
});

function PlatformPage() {
  const [municipalities, setMunicipalities] = useState<Awaited<ReturnType<typeof getPlatformMunicipalities>>>([]);
  const [adminRequests, setAdminRequests] = useState<Array<{id:string;municipality_id:string;email:string;state:'pending'|'linked';created_at:string}>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminRequestsError, setAdminRequestsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [uf, setUf] = useState('BA');
  const [slug, setSlug] = useState('');
  const [selectedMunicipalityId, setSelectedMunicipalityId] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  async function load() {
    setLoading(true); setError(''); setAdminRequestsError('');
    try {
      let rows: Awaited<ReturnType<typeof getPlatformMunicipalities>>;
      try {
        rows = await getPlatformMunicipalities();
      } catch {
        // Keep the registry available when an older PWA bundle cannot reach server functions.
        const { data: access, error: accessError } = await (supabase as any)
          .from('platform_administrators').select('is_active').maybeSingle();
        if (accessError) throw new Error('Acesso indisponível.');
        assertPlatformAdministrator(access);
        const { data: fallbackRows, error: queryError } = await (supabase as any)
          .from('municipalities').select('id,name,state_code,slug,state,created_at').order('name');
        if (queryError) throw new Error('Consulta de municípios indisponível.');
        rows = fallbackRows || [];
      }
      setMunicipalities(rows || []);
      if (!selectedMunicipalityId && rows?.length) setSelectedMunicipalityId(rows[0].id);

      // This read uses the authenticated client and the platform-admin RLS policy.
      // A request-list failure must not hide the municipality registry.
      const { data: requests, error: requestsError } = await (supabase as any)
        .from('municipal_admin_requests')
        .select('id,municipality_id,email,state,created_at')
        .order('created_at', { ascending: false });
      if (requestsError) {
        setAdminRequests([]);
        setAdminRequestsError('Não foi possível consultar os vínculos de Admin Master.');
      } else {
        setAdminRequests(requests || []);
      }
    } catch {
      setError('Não foi possível carregar os municípios. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedRequest = adminRequests.find(request => request.municipality_id === selectedMunicipalityId);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await createMunicipalityDraft({data:{name,stateCode:uf,slug}});
      setName('');setSlug('');toast.success('Município cadastrado como rascunho.');await load();
    } catch (e: any) { toast.error(e.message || 'Não foi possível cadastrar.'); }
    finally { setSaving(false); }
  }

  async function registerAdministrator(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMunicipalityId) {
      toast.error('Selecione um município.');
      return;
    }
    setRegistering(true);
    try {
      const result = await registerMunicipalAdministrator({data:{
        municipalityId: selectedMunicipalityId,
        email: adminEmail,
      }});
      setAdminEmail('');
      toast.success(result.state === 'linked'
        ? 'Admin Master vinculado ao município.'
        : 'E-mail registrado como pendente de criação/vínculo da conta.');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível registrar o Admin Master.');
    } finally {
      setRegistering(false);
    }
  }

  return <main className="min-h-screen bg-background p-6 text-foreground"><div className="mx-auto max-w-5xl space-y-8">
    <header className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Vetor Control</p><h1 className="text-2xl font-bold">Administração Geral</h1></div>
      <Button variant="outline" onClick={async()=>{await supabase.auth.signOut();window.location.href='/login';}}>Sair</Button></header>
    <section className="rounded-xl border p-5 space-y-3"><h2 className="text-lg font-semibold">Municípios</h2>
      <p className="text-sm text-muted-foreground">Euclides da Cunha mantém a operação atual. Novos municípios ficam em preparação até a validação da separação dos dados.</p>
      {loading ? <p>Carregando municípios...</p> : error ? <div role="alert"><p>{error}</p><Button onClick={load}>Tentar novamente</Button></div> :
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Município</th><th className="p-3">UF</th><th className="p-3">Situação</th></tr></thead>
        <tbody>{municipalities.map(m=><tr className="border-t" key={m.id}><td className="p-3">{m.name}</td><td className="p-3">{m.state_code}</td><td className="p-3">{m.state==='active'?'Em operação':'Em preparação'}</td></tr>)}</tbody></table></div>}
    </section>
    <form onSubmit={create} className="rounded-xl border p-5 space-y-4"><h2 className="text-lg font-semibold">Preparar novo município</h2>
      <div><Label htmlFor="municipality-name">Nome</Label><Input id="municipality-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></div>
      <div><Label htmlFor="municipality-uf">UF</Label><Input id="municipality-uf" value={uf} onChange={e=>setUf(e.target.value.toUpperCase())} required maxLength={2}/></div>
      <div><Label htmlFor="municipality-slug">Identificador, por exemplo: monte-santo-ba</Label><Input id="municipality-slug" value={slug} onChange={e=>setSlug(e.target.value)} required maxLength={100}/></div>
      <Button disabled={saving || loading || !!error}>{saving?'Salvando...':'Cadastrar rascunho'}</Button>
    </form>
    <form onSubmit={registerAdministrator} className="rounded-xl border p-5 space-y-4">
      <div><h2 className="text-lg font-semibold">Admin Master do município</h2>
        <p className="text-sm text-muted-foreground">Registre o e-mail do responsável municipal. O vínculo só ocorre imediatamente se a conta já for um Admin Master ativo nesse município. Caso contrário, fica pendente; este passo não envia convite nem ativa o município.</p>
        {adminRequestsError && <p role="alert" className="text-sm text-destructive">{adminRequestsError}</p>}</div>
      <div><Label htmlFor="administrator-municipality">Município</Label>
        <select id="administrator-municipality" value={selectedMunicipalityId} onChange={e=>{setSelectedMunicipalityId(e.target.value);setAdminEmail('');}} required disabled={loading || !!error || municipalities.length===0}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="" disabled>Selecione um município</option>
          {municipalities.map(m=><option key={m.id} value={m.id}>{m.name} / {m.state_code}</option>)}
        </select>
      </div>
      {selectedRequest ? <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <p><strong>{selectedRequest.email}</strong></p>
        <p className="text-muted-foreground">{selectedRequest.state==='linked'?'Admin Master vinculado':'Aguardando criação ou vínculo seguro da conta'}</p>
      </div> : <div><Label htmlFor="administrator-email">E-mail do Admin Master</Label>
        <Input id="administrator-email" type="email" autoComplete="email" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} required maxLength={254} placeholder="responsavel@municipio.gov.br"/>
      </div>}
      {!selectedRequest && <Button disabled={registering || loading || !!error || !selectedMunicipalityId}>{registering?'Registrando...':'Registrar Admin Master'}</Button>}
    </form>
  </div></main>;
}
