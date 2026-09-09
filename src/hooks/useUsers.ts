'use client';

import { useEffect, useState } from 'react';
import { User } from '../types';
import { getUsers, subscribeToUsers } from '../services/userStore';

/**
 * The live account list, withdrawn accounts included — filter with
 * `activeUsers` where only accounts that can sign in are wanted.
 *
 * The first value differs between the server and the client: accounts live in
 * localStorage, and on the server there is none, so the seed list stands in.
 * Anything rendered from this outside the app shell — which waits for mount
 * before rendering at all — has to gate on `useMounted` itself, or the two
 * disagree the moment an account is renamed, added or withdrawn.
 */
export function useUsers(): User[] {
  const [users, setUsers] = useState<User[]>(() => getUsers());

  useEffect(() => {
    const refresh = () => setUsers(getUsers());
    refresh();
    return subscribeToUsers(refresh);
  }, []);

  return users;
}
