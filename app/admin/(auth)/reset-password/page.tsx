"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

export default function RequestResetPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/security/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md">
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

            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>

            {/* Heading */}
            <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">Check Your Email</h1>
            <p className="text-center text-gray-500 mb-8">
              If an account exists with {email}, you will receive a password reset link shortly.
            </p>

            {/* Back Button */}
            <Link href="/admin/login">
              <Button variant="outline" className="w-full h-11 border-gray-300">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
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
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">Reset Password</h1>
          <p className="text-center text-gray-500 mb-8">
            Enter your email address and we&apos;ll send you a reset link
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-100 rounded px-4 py-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoFocus
                className="h-11 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-11 bg-blue-500 hover:bg-blue-600 text-white font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </Button>

            {/* Back to Login */}
            <Link href="/admin/login">
              <Button variant="ghost" className="w-full h-11 text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login
              </Button>
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
