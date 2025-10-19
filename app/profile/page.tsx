"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation"; // CORRIGIDO: useSearchParams e useMemo removidos
import { supabase } from "@/lib/supabaseClient";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";

// Definindo o tipo de Profile
type Profile = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  bairro?: string | null;
  city: string | null;
  state?: string | null;
  cep: string | null;
  cpf: string | null;
  status?: "waitlist" | "approved";
};

/* Utils */
function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}
function cepValid(cep: string) {
  return onlyDigits(cep).length === 8;
}
function cpfValid(cpf: string) {
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

// ==========================================================

function ProfilePageInner() {
  const router = useRouter();

  // Dados do perfil (estado local)
  const [profileId, setProfileId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null); // Apenas para exibição

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [bairro, setBairro] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [cpf, setCpf] = useState("");

  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Checa se pode salvar (simplificado)
  const canSave = !saving && name.length > 0 && cpfValid(cpf);

  // Carregar perfil
  useEffect(() => {
    (async () => {
      const { data: userSession } = await supabase.auth.getSession();
      const user = userSession.session?.user;

      if (!user) {
        // Redireciona para o login se não houver usuário
        router.replace("/auth?next=/profile");
        return;
      }

      setProfileId(user.id);
      setEmail(user.email);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileRow) {
        setName(profileRow.name || "");
        setWhatsapp(profileRow.whatsapp || "");
        setCep(profileRow.cep || "");
        setStreet(profileRow.street || "");
        setNumber(profileRow.number || "");
        setComplement(profileRow.complement || "");
        setBairro(profileRow.bairro || "");
        setCity(profileRow.city || "");
        setState(profileRow.state || "");
        setCpf(profileRow.cpf || "");
      }

      setLoading(false);
    })();
  }, [router]);

  // Salvar perfil
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId || !canSave) return;

    setSaving(true);
    setErr(null);
    setOk(null);

    const dataToSave: Omit<Profile, "id"> = {
      name,
      whatsapp: whatsapp ? onlyDigits(whatsapp).substring(1) : null, // Remove o '+' e formata
      cep: onlyDigits(cep) || null,
      street: street || null,
      number: number || null,
      complement: complement || null,
      bairro: bairro || null,
      city: city || null,
      state: state || null,
      cpf: onlyDigits(cpf) || null,
      // Não alteramos o status aqui
    };

    // CORRIGIDO: Remoção de `as any`
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: profileId, ...dataToSave });

    setSaving(false);

    if (error) {
      setErr("Erro ao salvar perfil: " + error.message);
      return;
    }

    setOk("Perfil atualizado com sucesso!");
    setTimeout(() => setOk(null), 3000);
  };

  // Preenchimento de CEP
  const lookupCep = async (v: string) => {
    const digits = onlyDigits(v);
    setCep(digits);
    if (digits.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (data.erro) {
          throw new Error("CEP inválido");
        }
        setStreet(data.logradouro || "");
        setBairro(data.bairro || "");
        setCity(data.localidade || "");
        setState(data.uf || "");
        // focamos no número
        document.getElementById("number")?.focus();
      } catch (e) {
        setErr("CEP não encontrado ou inválido.");
      }
    }
  };

  if (loading)
    return (
      <main className="min-h-screen bg-neutral-50 p-5 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Seu Perfil
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Carregando...</p>
      </main>
    );

  return (
    <main className="min-h-screen bg-neutral-50 p-5 pt-10">
      <div className="max-w-sm mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Seu Perfil
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Dados de contato e endereço para entrega.
        </p>

        <div className="mt-8">
          <form onSubmit={saveProfile} className="space-y-4">
            {/* Email (read-only) */}
            <div>
              <label className="text-xs font-medium text-neutral-600">
                Email
              </label>
              <input
                type="email"
                readOnly
                value={email || ""}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm bg-neutral-100 text-neutral-600"
              />
            </div>

            {/* Nome */}
            <div>
              <label
                htmlFor="name"
                className="text-xs font-medium text-neutral-600"
              >
                Nome Completo
              </label>
              <input
                type="text"
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
              />
            </div>

            {/* Whatsapp */}
            <div>
              <label
                htmlFor="whatsapp"
                className="text-xs font-medium text-neutral-600"
              >
                Whatsapp
              </label>
              <PhoneInput
                country={"br"}
                value={whatsapp}
                onChange={(phone) => setWhatsapp(phone)}
                disabled={saving}
                inputProps={{
                  name: "whatsapp",
                  required: true,
                  className: "react-phone-input-2",
                }}
                inputStyle={{
                  width: "100%",
                  borderRadius: "0.75rem",
                  borderColor: "rgb(229 231 235)",
                  paddingTop: "12px",
                  paddingBottom: "12px",
                  paddingLeft: "52px",
                  boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                }}
                buttonStyle={{
                  borderRadius: "0.75rem 0 0 0.75rem",
                  borderColor: "rgb(229 231 235)",
                  backgroundColor: "white",
                }}
              />
            </div>

            {/* CEP */}
            <div>
              <label
                htmlFor="cep"
                className="text-xs font-medium text-neutral-600"
              >
                CEP
              </label>
              <input
                type="text"
                id="cep"
                maxLength={9}
                value={cep}
                onChange={(e) => lookupCep(e.target.value)}
                disabled={saving}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
              />
              {cep.length > 0 && !cepValid(cep) && (
                <p className="mt-1 text-xs text-red-600">CEP deve ter 8 dígitos.</p>
              )}
            </div>

            {/* Rua */}
            <div>
              <label
                htmlFor="street"
                className="text-xs font-medium text-neutral-600"
              >
                Rua/Avenida
              </label>
              <input
                type="text"
                id="street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                disabled={saving}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
              />
            </div>

            <div className="flex gap-4">
              {/* Número */}
              <div className="w-1/3">
                <label
                  htmlFor="number"
                  className="text-xs font-medium text-neutral-600"
                >
                  Número
                </label>
                <input
                  type="text"
                  id="number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  disabled={saving}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                />
              </div>

              {/* Complemento */}
              <div className="flex-1">
                <label
                  htmlFor="complement"
                  className="text-xs font-medium text-neutral-600"
                >
                  Complemento (ex: apto 101)
                </label>
                <input
                  type="text"
                  id="complement"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  disabled={saving}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                />
              </div>
            </div>

            <div className="flex gap-4">
              {/* Bairro */}
              <div className="flex-1">
                <label
                  htmlFor="bairro"
                  className="text-xs font-medium text-neutral-600"
                >
                  Bairro
                </label>
                <input
                  type="text"
                  id="bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  disabled={saving}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                />
              </div>

              {/* Cidade */}
              <div className="flex-1">
                <label
                  htmlFor="city"
                  className="text-xs font-medium text-neutral-600"
                >
                  Cidade
                </label>
                <input
                  type="text"
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={saving}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                />
              </div>
            </div>

            {/* Estado */}
            <div>
              <label
                htmlFor="state"
                className="text-xs font-medium text-neutral-600"
              >
                Estado (UF)
              </label>
              <input
                type="text"
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                disabled={saving}
                maxLength={2}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black uppercase"
              />
            </div>

            {/* CPF */}
            <div>
              <label
                htmlFor="cpf"
                className="text-xs font-medium text-neutral-600"
              >
                CPF (apenas números)
              </label>
              <input
                type="text"
                id="cpf"
                maxLength={11}
                value={cpf}
                onChange={(e) => setCpf(onlyDigits(e.target.value))}
                disabled={saving}
                className={`mt-1 w-full rounded-xl border px-4 py-3 text-sm shadow-sm focus:ring-black ${
                  cpf.length > 0 && !cpfValid(cpf)
                    ? "border-red-500 focus:border-red-500"
                    : "border-neutral-200 focus:border-black bg-white"
                }`}
              />
              {cpf.length > 0 && !cpfValid(cpf) && (
                <p className="mt-1 text-xs text-red-600">
                  CPF inválido. Verifique os dígitos.
                </p>
              )}
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

        <div className="mt-4 flex justify-center">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/auth");
            }}
            className="text-xs text-neutral-600 underline"
          >
            Sair (Sign out)
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 p-5 pt-10">
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Seu Perfil
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Carregando...</p>
        </main>
      }
    >
      <ProfilePageInner />
    </Suspense>
  );
}
