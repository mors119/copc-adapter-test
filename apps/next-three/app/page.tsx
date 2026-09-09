'use client';

import dynamic from 'next/dynamic';

const ThreeClient = dynamic(() => import('./ThreeClient'), { ssr: false });

export default function Page() {
  return <ThreeClient />;
}
