import { useEffect, useRef, type ReactNode } from 'react';
import { mountControlPanel, type MountedPanel, type MountPanelOptions, type PanelState } from './index';
import type { FixtureCatalogEntry } from '@copc-test/core';
export { panelStateFromConfig } from './index';
export type { PanelActions, PanelSelection, PanelState } from './index';

export type ReactControlPanelProps = Omit<MountPanelOptions, 'state'> & { state: PanelState; fixtures?: FixtureCatalogEntry[] };

/** Thin React lifecycle wrapper around the single framework-neutral panel. */
export function ReactControlPanel({ config, renderers, state, actions, fixtures }: ReactControlPanelProps): ReactNode {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<MountedPanel | null>(null);
  const propsRef = useRef({ config, renderers, actions });
  propsRef.current = { config, renderers, actions };

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;
    const current = propsRef.current;
    const panel = mountControlPanel(target, {
      config: current.config,
      renderers: current.renderers,
      state,
      actions: {
        apply: (selection) => propsRef.current.actions.apply(selection),
        reload: () => propsRef.current.actions.reload(),
        startDemo: () => propsRef.current.actions.startDemo(),
        stopDemo: () => propsRef.current.actions.stopDemo(),
        overview: () => propsRef.current.actions.overview(),
        far: () => propsRef.current.actions.far(),
        near: () => propsRef.current.actions.near(),
      },
    });
    panelRef.current = panel;
    return () => {
      panel.destroy();
      panelRef.current = null;
    };
  }, []);

  useEffect(() => panelRef.current?.update(state), [state]);
  useEffect(() => { if (fixtures) panelRef.current?.setFixtures(fixtures); }, [fixtures]);
  return <div className="copc-panel-host" ref={targetRef} />;
}
