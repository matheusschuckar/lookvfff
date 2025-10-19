"use client";

import { useEffect, useMemo, useState, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";

// =======================================================
// TIPAGEM
// =======================================================

type Profile = {
  id: string;
  name: string | null;
  whatsapp: string | null; // Já no formato E.164
  street: string | null;
  number: string | null;
  complement: string | null;
  bairro: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  cpf: string | null;
  status?: "waitlist" | "approved";
};

// =======================================================
// UTILS
// =======================================================

function onlyDigits(v: string | null | undefined): string {
  return (v || "").toString().replace(/\D/g, "");
}

function cepValid(cep: string): boolean {
  return onlyDigits(cep).length === 8;
}

function cpfValid(cpf: string): boolean {
  const s = onlyDigits(cpf);
  if (s.length !== 11) return false;
  if (/^(\d)\1+$/.test(s)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(s[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(s[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(s[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  if (d2 !== parseInt(s[10])) return false;

  return true;
}

function maskCEP(v: string | null | undefined): string {
  const s = onlyDigits(v).slice(0, 8);
  if (s.length <= 5) return s;
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

function maskCPF(v: string | null | undefined): string {
  const s = onlyDigits(v).slice(0, 11);
  if (s.length <= 3) return s;
  if (s.length <= 6) return `${s.slice(0, 3)}.${s.slice(3)}`;
  if (s.length <= 9) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6)}`;
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

// =======================================================
// COMPONENTE PRINCIPAL
// =======================================================

function ProfileInner() {
  const router = useRouter();

  // Estados de carregamento e feedback
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Estado do usuário logado e do perfil (valores do DB)
  const [userId, setUserId] = useState<string | null>(null);
  const [initialProfile, setInitialProfile] = useState<Profile | null>(null);

  // Estados dos campos do formulário (valores editáveis)
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState(""); // E.164 (ex: 5511987654321)
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [bairro, setBairro] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [cpf, setCpf] = useState(""); // CPF com máscara

  // 1. Efeito para verificar a sessão e buscar o perfil
  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;

      if (!uid) {
        // Redireciona se não estiver logado
        router.replace("/auth");
        return;
      }
      setUserId(uid);
      
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .single();
      
      // Mapeia os dados do perfil (profileData) para o estado do formulário
      if (profileData) {
        setInitialProfile(profileData as Profile);
        setName(profileData.name || "");
        // O `react-phone-input-2` prefere a string E.164 completa
        setWhatsapp(onlyDigits(profileData.whatsapp)); 
        setCep(maskCEP(profileData.cep));
        setStreet(profileData.street || "");
        setNumber(profileData.number || "");
        setComplement(profileData.complement || "");
        setBairro(profileData.bairro || "");
        setCity(profileData.city || "");
        setState(profileData.state || "");
        setCpf(maskCPF(profileData.cpf)); // Aplica máscara para display
      }

      setLoading(false);
    })();
  }, [router]);

  // 2. Lógica para determinar se o botão de salvar deve estar ativo
  const canSave = useMemo(() => {
    if (!userId || loading) return false;

    // Campos obrigatórios de contato
    const validContact = name.trim().length > 0 && onlyDigits(whatsapp).length >= 10;
    
    // Campos de endereço
    const validAddress = cepValid(cep) && street.trim().length > 0 && number.trim().length > 0;
    
    // Campos de documento
    const validCpf = onlyDigits(cpf).length === 0 || cpfValid(cpf);

    // Verifica se houve alguma mudança em relação ao perfil inicial
    const hasChanges = 
      name !== (initialProfile?.name || "") ||
      onlyDigits(whatsapp) !== onlyDigits(initialProfile?.whatsapp) ||
      onlyDigits(cep) !== onlyDigits(initialProfile?.cep) ||
      street !== (initialProfile?.street || "") ||
      number !== (initialProfile?.number || "") ||
      complement !== (initialProfile?.complement || "") ||
      bairro !== (initialProfile?.bairro || "") ||
      city !== (initialProfile?.city || "") ||
      state !== (initialProfile?.state || "") ||
      onlyDigits(cpf) !== onlyDigits(initialProfile?.cpf);
      
    return hasChanges && validContact && validAddress && validCpf;

  }, [
    userId, loading, name, whatsapp, cep, street, number, complement, bairro, city, state, cpf, initialProfile
  ]);

  // 3. Handler de salvamento
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving || !userId) return;

    setSaving(true);
    setErr(null);
    setOk(null);

    const updates = {
      id: userId,
      name: name.trim(),
      whatsapp: onlyDigits(whatsapp), // Salva apenas dígitos
      cep: onlyDigits(cep), // Salva apenas dígitos
      street: street.trim(),
      number: number.trim(),
      complement: complement.trim(),
      bairro: bairro.trim(),
      city: city.trim(),
      state: state.trim(),
      cpf: onlyDigits(cpf), // Salva apenas dígitos
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(updates as any, { onConflict: "id" });

    if (error) {
      setErr("Erro ao salvar perfil. Tente novamente.");
    } else {
      setOk("Perfil salvo com sucesso!");
      // Atualiza o perfil inicial para resetar o 'hasChanges'
      setInitialProfile(updates as Profile); 
    }

    setSaving(false);
  }, [canSave, saving, userId, name, whatsapp, cep, street, number, complement, bairro, city, state, cpf]);
  
  // 4. Handler de logout
  const handleSignOut = useCallback(async () => {
      await supabase.auth.signOut();
      router.replace("/auth");
  }, [router]);


  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 p-5 pt-10 max-w-lg mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Seu Perfil
        </h1>
        <p className="mt-4 text-sm text-neutral-600">Carregando dados...</p>
      </main>
    );
  }

  // Redireciona o visitante (já tratado no useEffect, mas útil para o flow)
  if (!userId) return null; 

  return (
    <main className="min-h-screen bg-neutral-50 p-5 pt-10 max-w-lg mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-black">
        Seu Perfil
      </h1>

      <div className="mt-6 space-y-4">
        <p className="text-sm text-neutral-600">
          Mantenha seus dados atualizados para entregas e contato mais rápidos.
        </p>

        {/* Informações da conta */}
        <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">Conta</h2>
          
          <div className="space-y-1">
             <label htmlFor="email" className="text-xs text-gray-600">
              Email (não editável)
            </label>
            <input
              id="email"
              type="email"
              value={supabase.auth.getUser()?.data?.user?.email || "Email não encontrado"}
              readOnly
              className="w-full rounded-lg border bg-neutral-50 px-4 py-3 text-sm text-gray-500 cursor-default"
            />
          </div>
          
          <button
            onClick={handleSignOut}
            className="text-sm text-neutral-600 underline"
          >
            Sair da conta
          </button>
        </div>

        {/* Formulário de Perfil */}
        <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold border-b pb-2">Dados Pessoais e Endereço</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome */}
            <div className="space-y-1">
              <label htmlFor="name" className="text-xs text-gray-600">
                Nome completo
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </div>

            {/* Whatsapp */}
            <div className="space-y-1">
              <label htmlFor="whatsapp" className="text-xs text-gray-600">
                WhatsApp com DDD
              </label>
              {/* Usa o PhoneInput com apenas digitos (E.164) no estado */}
              <PhoneInput
                country={"br"}
                value={whatsapp} 
                onChange={setWhatsapp}
                countryCodeEditable={false}
                disableDropdown
                inputClass="!w-full !rounded-lg !border !px-4 !py-3 !text-sm"
                containerClass="!w-full"
                // Garante que o input use o valor do estado no formato E.164 (apenas dígitos)
                inputProps={{
                  name: 'whatsapp',
                  required: true,
                }}
              />
            </div>

            {/* CPF */}
            <div className="space-y-1">
              <label htmlFor="cpf" className="text-xs text-gray-600">
                CPF (Opcional)
              </label>
              <input
                id="cpf"
                type="text"
                value={maskCPF(cpf)}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                maxLength={14} // 11 dígitos + 3 pontos + 1 traço
                className={`w-full rounded-lg border px-4 py-3 text-sm ${
                  cpf.length > 0 && !cpfValid(cpf)
                    ? "border-red-500 ring-red-500"
                    : "border-gray-300 focus:border-black focus:ring-black"
                }`}
              />
              {cpf.length > 0 && !cpfValid(cpf) && (
                <p className="mt-1 text-xs text-red-600">
                  CPF inválido. Verifique os dígitos.
                </p>
              )}
            </div>

            {/* CEP */}
            <div className="space-y-1">
              <label htmlFor="cep" className="text-xs text-gray-600">
                CEP
              </label>
              <input
                id="cep"
                type="text"
                value={maskCEP(cep)}
                onChange={(e) => setCep(e.target.value)}
                required
                placeholder="00000-000"
                maxLength={9} // 8 dígitos + 1 traço
                className={`w-full rounded-lg border px-4 py-3 text-sm ${
                  cep.length > 0 && !cepValid(cep)
                    ? "border-red-500 ring-red-500"
                    : "border-gray-300 focus:border-black focus:ring-black"
                }`}
              />
              {cep.length > 0 && !cepValid(cep) && (
                <p className="mt-1 text-xs text-red-600">CEP inválido.</p>
              )}
            </div>

            {/* Rua e Número (lado a lado) */}
            <div className="flex gap-4">
              <div className="space-y-1 flex-1">
                <label htmlFor="street" className="text-xs text-gray-600">
                  Rua/Avenida
                </label>
                <input
                  id="street"
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </div>
              <div className="space-y-1 w-24 shrink-0">
                <label htmlFor="number" className="text-xs text-gray-600">
                  Nº
                </label>
                <input
                  id="number"
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </div>
            </div>

            {/* Complemento */}
            <div className="space-y-1">
              <label htmlFor="complement" className="text-xs text-gray-600">
                Complemento (Ex: Apt 101)
              </label>
              <input
                id="complement"
                type="text"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </div>
            
            {/* Bairro, Cidade e Estado (em linha) */}
            <div className="space-y-1">
              <label htmlFor="bairro" className="text-xs text-gray-600">
                Bairro
              </label>
              <input
                id="bairro"
                type="text"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </div>

            <div className="flex gap-4">
              {/* Cidade */}
              <div className="space-y-1 flex-1">
                <label htmlFor="city" className="text-xs text-gray-600">
                  Cidade
                </label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </div>
              {/* Estado */}
              <div className="space-y-1 w-24 shrink-0">
                <label htmlFor="state" className="text-xs text-gray-600">
                  Estado
                </label>
                <input
                  id="state"
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                  maxLength={2}
                  className="w-full rounded-lg border px-4 py-3 text-sm uppercase"
                />
              </div>
            </div>

            {err && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}
            {ok && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                {ok}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSave || saving}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
            >
              {saving ? "Salvando…" : "Salvar perfil"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

// =======================================================
// EXPORT
// =======================================================

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 p-5 pt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Seu Perfil
          </h1>
          <p className="mt-4 text-sm text-neutral-600">Carregando...</p>
        </main>
      }
    >
      <ProfileInner />
    </Suspense>
  );
}
