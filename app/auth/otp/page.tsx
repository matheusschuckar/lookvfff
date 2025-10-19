// app/auth/otp/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react"; // Adicionado para os ícones

type Step = "request" | "verify" | "success"; // Adicionei 'success' para o fluxo de redefinição

export const dynamic = "force-dynamic";

function OtpPageInner() {
  const router = useRouter();

  const search = useSearchParams();
  const nextRaw = search?.get("next") || "/";

  const next = useMemo(() => {
    try {
      const decoded = decodeURIComponent(nextRaw);
      // Evita redirecionamento para URLs externas
      if (/^https?:\\/\\//i.test(decoded)) return "/";
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
    })();
  }, [router, next]);

  // Handle: Enviar o e-mail de recuperação
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setOk(null);

    // Tipagem: remove `as any` e confia no tipo inferido pelo Supabase
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/otp?next=${encodeURIComponent(
        nextRaw
      )}`,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setOk("Email de recuperação enviado! Verifique sua caixa de entrada.");
    setStep("verify");
  };

  // Handle: Verificar código e setar nova senha
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setOk(null);

    // Tipagem: remove `as any` e confia no tipo inferido
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "recovery",
    });
    
    // CORRIGIDO: Variável vData estava declarada, mas nunca usada. Foi removida.
    // const vData = data; // Linha 92 (erro de no-unused-vars)

    if (error) {
      setLoading(false);
      setErr("Código inválido ou expirado.");
      return;
    }

    // Se o código for válido, trocamos a senha
    // Tipagem: remove `as any` e confia no tipo inferido
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setErr(updateError.message);
      return;
    }

    setOk("Sua senha foi atualizada com sucesso.");
    setStep("success");
    // Redireciona após sucesso
    setTimeout(() => {
        router.replace(next);
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-neutral-50 p-5 pt-10">
      <div className="max-w-sm mx-auto">
        <h1 className="text-4xl font-semibold tracking-tight text-black">
          {step === "request" && "Recuperar"}
          {step === "verify" && "Nova Senha"}
          {step === "success" && "Sucesso!"}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {step === "request" &&
            "Informe seu e-mail para receber o link de recuperação de senha."}
          {step === "verify" &&
            "Digite o código que você recebeu e a sua nova senha."}
          {step === "success" &&
            "Você será redirecionado em breve..."}
        </p>

        <div className="mt-8 space-y-4">
          {step === "request" && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="text-xs font-medium text-neutral-600"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
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
                {loading ? "Enviando…" : "Receber código"}
              </button>
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={handleVerify} className="space-y-4">
              {/* Campo Código */}
              <div>
                <label
                  htmlFor="code"
                  className="text-xs font-medium text-neutral-600"
                >
                  Código (Token)
                </label>
                <input
                  type="text"
                  id="code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                />
              </div>

              {/* Campo Senha */}
              <div className="relative">
                <label
                  htmlFor="password"
                  className="text-xs font-medium text-neutral-600"
                >
                  Nova Senha
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm shadow-sm focus:border-black focus:ring-black"
                />
                <div className="absolute inset-y-0 right-0 top-6 flex items-center pr-3">
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="text-neutral-500"
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
                {loading ? "Validando…" : "Definir nova senha"}
              </button>
            </form>
          )}

          {step === "success" && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Sua senha foi redefinida. Redirecionando...
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={() =>
              router.replace(`/auth?next=${encodeURIComponent(nextRaw)}`)
            }
            className="text-xs text-neutral-600 underline"
          >
            Voltar para o login
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
            Recuperar
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Carregando informações...
          </p>
        </main>
      }
    >
      <OtpPageInner />
    </Suspense>
  );
}
