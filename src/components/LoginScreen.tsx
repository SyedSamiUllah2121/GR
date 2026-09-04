'use client';

import React, { useState } from 'react';
import { CheckSquare, Lock, Mail, AlertCircle } from 'lucide-react';
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
    <div className="min-h-screen bg-[#F5F3EC] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-[#213B26] text-white shadow-sm mb-3">
            <CheckSquare className="w-6 h-6 text-[#E7EEE4]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#242217]">
            Inspection Log
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-[#635E4F] mt-1 font-semibold">
            Weekly Hygiene &amp; Service
          </p>
        </div>

        {/* Login Card */}
        <div
          id="login-card"
          className="bg-white border border-[#DEDACB] rounded-md p-6 md:p-8 shadow-xs"
        >
          <h2 className="text-lg font-bold text-[#242217] mb-5">
            Sign in to inspector account
          </h2>

          {errorMessage && (
            <div
              id="login-error-banner"
              className="mb-5 p-3 rounded-md bg-[#F4E4DF] border border-[#9C3B2E]/30 text-[#9C3B2E] text-sm flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#635E4F]">
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
                  className="w-full pl-9 pr-4 py-2.5 bg-[#F5F3EC] border border-[#DEDACB] rounded-md text-sm text-[#242217] placeholder:text-[#635E4F]/50 focus:outline-none focus:ring-1 focus:ring-[#2F5233]"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-[10px] font-bold uppercase tracking-wider text-[#635E4F] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#635E4F]">
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
                  className="w-full pl-9 pr-4 py-2.5 bg-[#F5F3EC] border border-[#DEDACB] rounded-md text-sm text-[#242217] placeholder:text-[#635E4F]/50 focus:outline-none focus:ring-1 focus:ring-[#2F5233]"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="w-full mt-2 py-3 px-4 bg-[#2F5233] hover:bg-[#3d6a42] text-white text-sm font-semibold rounded-md transition-colors cursor-pointer"
            >
              Sign in
            </button>
          </form>

          {/* Demo Hint */}
          <div className="mt-5 text-center">
            <p className="text-xs text-[#635E4F]">
              Demo access — email <span className="font-semibold text-[#242217]">123</span>, password{' '}
              <span className="font-semibold text-[#242217]">123</span>
            </p>
            <button
              type="button"
              onClick={fillDemo}
              className="mt-2 text-xs text-[#2F5233] hover:underline font-semibold cursor-pointer"
            >
              Fill demo credentials
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-[#635E4F]">
          Internal weekly restaurant inspection system
        </div>
      </div>
    </div>
  );
};
