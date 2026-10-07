import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@copc-test/ui/panel.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'COPC adapter · Next SSR', description: 'Next server/client boundary validation for the packed COPC adapter.' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return <html lang="en"><body>{children}</body></html>;
}
