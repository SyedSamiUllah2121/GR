'use client';

import { useEffect, useState } from 'react';
import { User } from '../types';
import { currentUser } from '../services/session';
import { subscribeToStorage } from '../services/storage';
import { subscribeToUsers } from '../services/userStore';

/**
 * The signed-in account, kept live.
 *
 * Watches two stores, because two things change who you are: the session
 * (signing in or out, here or in another tab) and the account itself (an
 * admin editing your role, or withdrawing you). Returns null while signed
 * out, and on the server — every screen behind sign-in renders under
 * AppShell, which shows nothing until it has a user.
 */
export function useCurrentUser(): User | null {
  /*
   * Read in the initialiser rather than waiting for the effect. Every screen
   * behind sign-in renders under AppShell, which shows nothing until it has a
   * user, so a first render that reported "nobody" left those screens setting
   * up their initial state — which branch is selected, say — against the
   * wrong answer. `currentUser` returns null on the server, where storage
   * does not exist, so there is no hydration mismatch to cause.
   */
  const [user, setUser] = useState<User | null>(() => currentUser());

  useEffect(() => {
    const refresh = () => setUser(currentUser());
    refresh();
    const stopStorage = subscribeToStorage(refresh);
    const stopUsers = subscribeToUsers(refresh);
    return () => {
      stopStorage();
      stopUsers();
    };
  }, []);

  return user;
}
