'use client';

import React, { useState } from 'react';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { setAuthenticated } from '../services/storage';
import { useRouter } from 'next/navigation';

export const LoginScreen: React.FC = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() === '123' && password.trim() === '123') {
      setErrorMessage('');
      setAuthenticated(true);
      router.push('/inspections');
    } else {
      setErrorMessage('Incorrect email or password');
    }
  };

  const fillDemo = () => {
    setEmail('123');
    setPassword('123');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-[#F6F6F8] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <BrandLogo className="w-[17rem] mx-auto mb-5 border border-[#E6E7EB] shadow-xs" />
          <h1 className="text-2xl font-bold tracking-tight text-[#17181D]">
            Inspection Log
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-[#6B6F76] mt-1 font-semibold">
            Food Safety &amp; Quality
          </p>
        </div>

        {/* Login Card */}
        <div
          id="login-card"
          className="bg-white border border-[#E6E7EB] rounded-md p-6 md:p-8 shadow-xs"
        >
          <h2 className="text-lg font-bold text-[#17181D] mb-5">
            Sign in to inspector account
          </h2>

          {errorMessage && (
            <div
              id="login-error-banner"
              className="mb-5 p-3 rounded-md bg-[#FDECEE] border border-[#C8202D]/30 text-[#C8202D] text-sm flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B6F76]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email-input"
                  type="text"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Enter email (or 123)"
                  className="w-full pl-9 pr-4 py-2.5 bg-[#F6F6F8] border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B6F76]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Enter password (or 123)"
                  className="w-full pl-9 pr-4 py-2.5 bg-[#F6F6F8] border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:ring-1 focus:ring-[#C8202D]"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="w-full mt-2 py-3 px-4 bg-[#C8202D] hover:bg-[#A81823] text-white text-sm font-semibold rounded-md transition-colors cursor-pointer"
            >
              Sign in
            </button>
          </form>

          {/* Demo Hint */}
          <div className="mt-5 text-center">
            <p className="text-xs text-[#6B6F76]">
              Demo access — email <span className="font-semibold text-[#17181D]">123</span>, password{' '}
              <span className="font-semibold text-[#17181D]">123</span>
            </p>
            <button
              type="button"
              onClick={fillDemo}
              className="mt-2 text-xs text-[#C8202D] hover:underline font-semibold cursor-pointer"
            >
              Fill demo credentials
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-[#6B6F76]">
          Internal weekly restaurant inspection system
        </div>
      </div>
    </div>
  );
};
