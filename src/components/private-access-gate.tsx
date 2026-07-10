"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  isValidAccessToken,
  RULEQUANT_ACCESS_PARAM_NAMES,
  RULEQUANT_ACCESS_STORAGE_KEY,
  RULEQUANT_ACCESS_TOKEN,
} from "@/lib/security/private-access";

type GateState = "checking" | "granted" | "blocked";

function shouldBypassForLocalDevelopment() {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_RULEQUANT_ACCESS_GATE === "off") return true;

  const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
  return localHostnames.has(window.location.hostname) && process.env.NEXT_PUBLIC_RULEQUANT_LOCAL_GATE !== "on";
}

function readTokenFromUrl() {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  for (const key of RULEQUANT_ACCESS_PARAM_NAMES) {
    const queryValue = url.searchParams.get(key);
    if (queryValue) return queryValue;
  }

  const hash = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  for (const key of RULEQUANT_ACCESS_PARAM_NAMES) {
    const hashValue = hashParams.get(key);
    if (hashValue) return hashValue;
  }

  return "";
}

function removeTokenFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  let changed = false;
  for (const key of RULEQUANT_ACCESS_PARAM_NAMES) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    for (const key of RULEQUANT_ACCESS_PARAM_NAMES) {
      if (hashParams.has(key)) {
        hashParams.delete(key);
        changed = true;
      }
    }
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
  }

  if (changed) {
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function PrivateAccessScreen({ checking }: { checking: boolean }) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#04070b] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(20,184,166,0.18),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(124,58,237,0.22),transparent_32%),linear-gradient(135deg,rgba(8,47,73,0.34),rgba(2,6,23,0.96)_55%)]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
        <div className="w-full rounded-lg border border-white/10 bg-white/[0.055] p-7 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-9">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-200/25 bg-cyan-300/10 text-cyan-100">
            {checking ? <ShieldCheck className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
          </div>
          <p className="text-sm font-medium text-cyan-200">RuleQuant 私密入口</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
            {checking ? "正在检查访问入口" : "请使用专用链接打开"}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
            这个页面不做公开入口展示，也不允许搜索引擎收录。请使用创建者发你的专用链接打开一次，之后同一台设备会自动记住访问权限。
          </p>
          <div className="mt-7 rounded-md border border-cyan-200/15 bg-cyan-300/[0.08] p-4 text-sm leading-7 text-cyan-50">
            <p className="font-medium">说明</p>
            <p className="mt-1 text-cyan-100/85">
              这是轻量私密分享，不是账号密码系统。真正需要强权限时，后续再加登录和数据库权限控制。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PrivateAccessGate({ children }: { children: ReactNode }) {
  const [gateState, setGateState] = useState<GateState>("checking");

  useEffect(() => {
    let nextGateState: GateState = "blocked";

    if (shouldBypassForLocalDevelopment()) {
      nextGateState = "granted";
    } else {
      const tokenFromUrl = readTokenFromUrl();
      if (isValidAccessToken(tokenFromUrl)) {
        window.localStorage.setItem(RULEQUANT_ACCESS_STORAGE_KEY, RULEQUANT_ACCESS_TOKEN);
        removeTokenFromUrl();
        nextGateState = "granted";
      } else {
        const storedToken = window.localStorage.getItem(RULEQUANT_ACCESS_STORAGE_KEY);
        nextGateState = isValidAccessToken(storedToken) ? "granted" : "blocked";
      }
    }

    const timer = window.setTimeout(() => setGateState(nextGateState), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (gateState === "granted") return <>{children}</>;
  return <PrivateAccessScreen checking={gateState === "checking"} />;
}
