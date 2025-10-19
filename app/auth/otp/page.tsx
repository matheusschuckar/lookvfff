// app/auth/otp/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react"; // Certifique-se de que Loader2 foi adicionado

// Adicionei "reset" para o caso de o usuário ser redirecionado após o token de recuperação
type Step = "request" | "verify" | "reset"; 

export const dynamic = "force-dynamic";

function OtpPageInner() {
  const router = useRouter();

  const search = useSearchParams();
  const nextRaw = search?.get("next") || "/";

  const next = useMemo(() => {
    try {
      const decoded = decodeURIComponent(nextRaw);
      // CORRIGIDO: Removido escape duplo (\\/\\/ -> ://) que causava o lexing error
      if (/^https?:\/\//i.test(decoded)) return "/";
      return decoded || "/";
    } catch {
      return "/";
    }
  }, [nextRaw]);

  const [step, setStep] = useState<Step>("request");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // form states
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(""); // token/código do e-mail
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  // Se já estiver logado, manda para `next`
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) router.replace(next);
      
      // Se tiver 'type=recovery' na URL, vai direto para 'verify'
      const type = search?.get("type");
      if (type === "recovery" || type === "otp") {
          setStep("verify");
      }
    })();
  }, [router, next, search]);
  
  // Se o usuário chegar com um token de recuperação na URL, usa o useEffect para processá-lo.
  useEffect(() => {
      // Supabase trata o token de recuperação automaticamente se estiver presente na URL.
      // Apenas precisamos verificar o estado da sessão.
      (async () => {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
              setStep("reset"); // Se estiver logado após recovery, vai para resetar senha.
          }
      })();
  }, []); // Roda uma vez.

  // 1. Request OTP
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setErr(null);
    setOk(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/otp?next=${encodeURIComponent(
          nextRaw
        )}&type=otp`,
      },
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setOk("Magic link enviado! Verifique seu e-mail.");
    setStep("verify");
  };

  // 2. Verify OTP (token)
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setErr(null);

    const { error, data } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email", // Use 'email' para magic link ou OTP
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }
    
    // Se a verificação for bem-sucedida, o usuário estará logado.
    // Redireciona para `next`.
    if (data.session) {
        router.replace(next);
        return;
    }

    // Se a verificação foi de `recovery` e a sessão foi estabelecida
    // o usuário já deve ter sido encaminhado para o estado `reset` via useEffect (abaixo)
    // Se chegou aqui e não tem sessão, algo deu errado.
    setErr("Verificação bem-sucedida, mas a sessão não foi estabelecida.");

  };
  
  // 3. Reset Password (após recovery)
  const handleReset = async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;
      
      setLoading(true);
      setErr(null);
      setOk(null);
      
      const { error } = await supabase.auth.updateUser({ password });
      
      setLoading(false);
      
      if (error) {
          setErr(error.message);
          return;
      }
      
      setOk("Senha atualizada com sucesso! Redirecionando...");
      setTimeout(() => router.replace(next), 1000);
  };


  return (
    <main className="min-h-screen bg-neutral-50 p-5 pt-10">
      <h1 className="text-4xl font-semibold tracking-tight text-black">
        {step === "request" && "Login ou Recuperação"}
        {step === "verify" && "Verificar código"}
        {step === "reset" && "Definir nova senha"}
      </h1>
      <p className="mt-1 text-sm text-neutral-600">
        {step === "request" && "Insira seu e-mail para receber o link ou código de acesso."}
        {step === "verify" && "Cheque sua caixa de entrada e spam. O código expira em 5 minutos."}
        {step === "reset" && "Crie uma nova senha forte."}
      </p>

      <div className="mt-8 max-w-sm">
        {/* Formulário 1: Request OTP/Magic Link */}
        {step === "request" && (
          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-700">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                placeholder="seu@email.com"
                autoFocus
              />
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
              disabled={loading}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5 mx-auto" />
              ) : (
                "Enviar link/código de acesso"
              )}
            </button>
          </form>
        )}

        {/* Formulário 2: Verify OTP */}
        {step === "verify" && (
            <form onSubmit={handleVerify} className="space-y-4">
                <div>
                    <label className="text-sm font-medium text-neutral-700">
                        Código (Token)
                    </label>
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                        className="mt-1 block w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                        placeholder="123456"
                        autoFocus
                        inputMode="numeric"
                        pattern="[0-9]*"
                    />
                </div>
                
                {err && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {err}
                  </p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                >
                    {loading ? (
                        <Loader2 className="animate-spin h-5 w-5 mx-auto" />
                    ) : (
                        "Verificar e continuar"
                    )}
                </button>
                
                <button 
                    type="button" 
                    onClick={() => setStep("request")}
                    className="mt-4 w-full text-xs text-neutral-600 underline"
                >
                    Mudar e-mail ou reenviar
                </button>
            </form>
        )}
        
        {/* Formulário 3: Reset Password (Apenas se o token recovery for válido) */}
        {step === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700">
                  Nova Senha
                </label>
                <div className="relative mt-1">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="block w-full rounded-lg border border-neutral-300 px-4 py-3 pr-12 text-sm shadow-sm focus:border-black focus:ring-black"
                    placeholder="Mínimo 6 caracteres"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400"
                  >
                    {showPw ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
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
                disabled={loading}
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? (
                    <Loader2 className="animate-spin h-5 w-5 mx-auto" />
                ) : (
                    "Definir nova senha"
                )}
              </button>
            </form>
          )}

        <div className="mt-4 flex justify-center">
          <button
            onClick={() =>
              router.replace(`/auth?next=${encodeURIComponent(nextRaw)}`)
            }
            className="text-xs text-neutral-600 underline"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    </main>
  );
}

export default function OtpPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 p-5 pt-10">
          <h1 className="text-4xl font-semibold tracking-tight text-black">
            Recuperação
          </h1>
          <p className="mt-1 text-sm text-neutral-600">Carregando...</p>
        </main>
      }
    >
      <OtpPageInner />
    </Suspense>
  );
}
