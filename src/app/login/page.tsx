"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("prof.son@biorna.kr");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl: "/",
    });

    if (result?.error) {
      setError("로그인 실패: 이메일 또는 비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <main className="min-h-screen bg-black text-yellow-400 flex items-center justify-center p-8">
      <div className="w-full max-w-md border border-yellow-500 rounded-xl p-8">
        <div className="flex items-center gap-4 mb-8">
          <img src="/logo.png" className="w-16 h-16" alt="ADD Logo" />
          <div>
            <h1 className="text-2xl font-bold">zenome Lab AI Hub</h1>
            <p className="text-yellow-200">Secure Login</p>
          </div>
        </div>

        <label className="block mb-2">Email</label>
        <input
          className="w-full mb-4 p-3 rounded bg-neutral-900 border border-yellow-500 text-yellow-100"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="block mb-2">Password</label>
        <input
          className="w-full mb-4 p-3 rounded bg-neutral-900 border border-yellow-500 text-yellow-100"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="mb-4 text-red-400">{error}</p>}

        <button
          onClick={handleLogin}
          className="w-full px-6 py-3 bg-yellow-400 text-black rounded font-semibold"
        >
          Login
        </button>
      </div>
    </main>
  );
}