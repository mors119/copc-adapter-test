export const VISUAL_COLOR_MODES = ['fixed', 'elevation', 'rgb'] as const;
export type VisualColorMode = (typeof VISUAL_COLOR_MODES)[number];

export type VisualHarnessOptions = {
  enabled: boolean;
  colorMode: VisualColorMode;
};

/** Read the intentionally narrow visual-run controls shared by representative apps. */
export function readVisualHarnessOptions(search = window.location.search): VisualHarnessOptions {
  const params = new URLSearchParams(search);
  const requestedColorMode = params.get('colorMode');

  return {
    enabled: params.get('visual') === '1',
    colorMode: VISUAL_COLOR_MODES.includes(requestedColorMode as VisualColorMode)
      ? requestedColorMode as VisualColorMode
      : 'elevation',
  };
}
