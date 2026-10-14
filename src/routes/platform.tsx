import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPlatformMunicipalities, createMunicipalityDraft } from '@/lib/platform.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [uf, setUf] = useState('BA');
  const [slug, setSlug] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setMunicipalities(await getPlatformMunicipalities()); }
    catch { setError('Não foi possível carregar os municípios. Tente novamente.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await createMunicipalityDraft({data:{name,stateCode:uf,slug}});
      setName('');setSlug('');toast.success('Município cadastrado como rascunho.');await load();
    } catch (e: any) { toast.error(e.message || 'Não foi possível cadastrar.'); }
    finally { setSaving(false); }
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
  </div></main>;
}
