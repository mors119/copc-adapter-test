'use client';

import dynamic from 'next/dynamic';

const R3FClient = dynamic(() => import('./R3FClient'), { ssr: false });

export default function Page() {
  return <R3FClient />;
}
