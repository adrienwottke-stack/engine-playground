/** Reference dimensions; source/assumption detail lives beside the authored GLB. */
export const PISTON_SPEC={
  assetId:'m52-piston-reference-v1',
  boreMm:84,referenceDiameterMm:83.97,compressionHeightMm:31.82,overallHeightMm:51.8,
  pinDiameterMm:22,pinLengthMm:56,
  // Preserve the existing head/chamber illustration's 9 mm clearance. This is
  // an illustrative valve-seat plane, not the native 211 mm deck measurement.
  illustrativeCrownClearanceMm:9,
} as const;
