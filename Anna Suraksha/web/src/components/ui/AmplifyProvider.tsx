'use client';
import { useEffect } from 'react';
import { configureAmplify } from '@/lib/amplify';

export function AmplifyProvider() {
  useEffect(() => { configureAmplify(); }, []);
  return null;
}
