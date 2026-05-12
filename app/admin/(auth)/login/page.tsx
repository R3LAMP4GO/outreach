"use client";

import * as React from "react";
import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Checkbox } from "@/components/shadcn/ui/checkbox";
import { Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/admin";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/admin";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  // Load saved email on mount
  React.useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Login failed. Please try again.");
        setIsLoading(false);
        return;
      }

      // Save or clear email based on remember me
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/android-chrome-512x512.png"
              alt="__YOUR_BRAND__"
              width={180}
              height={60}
              className="h-14 w-auto"
            />
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-center text-gray-500 mb-8">Sign in to __YOUR_BRAND__ Management</p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
                autoFocus
                className="h-11 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-700 font-medium">
                  Password
                </Label>
                <Link
                  href="/admin/reset-password"
                  className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="h-11 pr-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                className="border-gray-300"
              />
              <Label
                htmlFor="remember"
                className="text-sm text-gray-600 font-normal cursor-pointer"
              >
                Remember me
              </Label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-100 rounded px-4 py-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-11 bg-blue-500 hover:bg-blue-600 text-white font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-gray-500 mt-6">
            Need access to the system?{" "}
            <a
              href="mailto:__YOUR_SUPPORT_EMAIL__"
              className="text-gray-700 underline hover:text-blue-600 transition-colors"
            >
              Contact your administrator
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
