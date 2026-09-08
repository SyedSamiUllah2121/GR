'use client';

import { useEffect, useState } from 'react';
import { User } from '../types';
import { getUsers, subscribeToUsers } from '../services/userStore';

/**
 * The live account list, withdrawn accounts included — filter with
 * `activeUsers` where only accounts that can sign in are wanted.
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
